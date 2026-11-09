import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type ConsultaCreate = components['schemas']['ConsultaCreate'];
type ConsultaOut = components['schemas']['ConsultaOut'];
type ConsultaMetadatosOut = components['schemas']['ConsultaMetadatosOut'];
type ConsultaFila = ConsultaOut | ConsultaMetadatosOut;
type Menor = components['schemas']['MenorOut'];
type Hogar = components['schemas']['HogarOut'];
type Zona = components['schemas']['ZonaOut'];

const MENSAJE_GENERICO = 'No se pudo completar la consulta. Intente de nuevo.';

/**
 * Buscador en lenguaje natural dentro del panel de cada rol (ADR-0010 sección 1, sin módulo
 * aparte). El asistente solo busca entre lo que el usuario puede ver y siempre cita la fuente
 * (documento/versión/categoría/fecha, nunca el nombre real del NNA o de la madre en la cita,
 * aunque la respuesta sí tenga los datos reales restituidos porque el usuario ya tiene permiso
 * de verla). Si no hay fuente, el sistema avisa que no sabe y no llama al modelo externo.
 */
@Component({
  selector: 'app-ia-consulta',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Asistente de IA</h1>
    <p class="nota">
      Escriba su pregunta en palabras sencillas. El asistente solo busca entre los expedientes que
      usted puede ver y siempre dice de dónde sacó cada dato.
    </p>

    @if (esAdmin()) {
      <p><a routerLink="/ia/estado">Ver configuración del asistente</a></p>
    }
    @if (puedeRedactar()) {
      <p><a routerLink="/ia/redaccion">Apoyo a la redacción de un informe</a></p>
    }

    <form class="formulario tarjeta" (ngSubmit)="preguntar()" #f="ngForm">
      <label for="pregunta">Su pregunta</label>
      <textarea
        id="pregunta"
        name="pregunta"
        rows="3"
        required
        [(ngModel)]="pregunta"
        [disabled]="preguntando()"
        placeholder="Ejemplo: ¿Cuándo fue la última visita médica de este menor?"
      ></textarea>
      <label for="menorIdCtx">Limitar a un menor (opcional)</label>
      <select id="menorIdCtx" name="menorIdCtx" [(ngModel)]="menorId" [disabled]="preguntando() || cargandoFiltros()">
        <option value="">Todos los menores a los que tengo acceso</option>
        @for (m of menores(); track m.id) {
          <option [value]="m.id">{{ m.nombres }} {{ m.apellidos }}{{ m.numero_documento ? ' — ' + m.numero_documento : '' }}</option>
        }
      </select>
      @if (puedeFiltrarPorHogar()) {
        <label for="hogarIdCtx">Limitar a un hogar (opcional)</label>
        <select id="hogarIdCtx" name="hogarIdCtx" [(ngModel)]="hogarId" [disabled]="preguntando() || cargandoFiltros()">
          <option value="">Todos los hogares</option>
          @for (h of hogares(); track h.id) {
            <option [value]="h.id">{{ etiquetaHogar(h) }}</option>
          }
        </select>
      }
      <button type="submit" [disabled]="f.invalid || preguntando()">
        {{ preguntando() ? 'Buscando...' : 'Preguntar' }}
      </button>
    </form>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (respuesta()) {
      <section class="tarjeta">
        <h2>Respuesta</h2>
        @if (respuesta()!.sin_resultado) {
          <p class="nota">
            No se encontró información con una fuente confiable para responder. No se envió la
            pregunta al asistente externo.
          </p>
        } @else {
          <p>{{ respuesta()!.respuesta }}</p>
          <h3>Fuentes citadas</h3>
          <ul class="lista-simple">
            @for (c of fragmentosDe(respuesta()!); track $index) {
              <li>{{ textoFragmento(c) }}</li>
            }
            @if (fragmentosDe(respuesta()!).length === 0) {
              <li class="nota">No se citó ninguna fuente concreta.</li>
            }
          </ul>
        }
      </section>
    }

    <section class="tarjeta">
      <h2>Su historial de consultas</h2>
      @if (!mostrarHistorial()) {
        <button type="button" (click)="cargarHistorial()">Ver historial</button>
      } @else {
        @if (cargandoHistorial()) {
          <p class="nota">Cargando historial...</p>
        }
        <ul class="lista-simple">
          @for (h of historial(); track h.id) {
            <li class="tarjeta">
              @if (esMetadatosSolo(h)) {
                <p class="nota">
                  Solo metadatos (rol auditor): modelo {{ h.modelo }}, proveedor {{ h.proveedor }}.
                </p>
              } @else {
                <p><strong>{{ preguntaDe(h) }}</strong></p>
                <p>{{ respuestaDe(h) }}</p>
              }
              <p>Fecha: {{ h.creado_en }} — {{ h.sin_resultado ? 'Sin fuente' : 'Con fuente' }}</p>
            </li>
          }
          @if (!cargandoHistorial() && historial().length === 0) {
            <p class="nota">Todavía no ha hecho ninguna consulta.</p>
          }
        </ul>
      }
    </section>
  `,
})
export class IaConsulta {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly esAdmin = computed(() => this.auth.rol() === 'admin');
  protected readonly puedeRedactar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor';
  });
  protected readonly puedeFiltrarPorHogar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  protected pregunta = '';
  protected menorId = '';
  protected hogarId = '';

  protected readonly cargandoFiltros = signal(false);
  protected readonly menores = signal<Menor[]>([]);
  protected readonly hogares = signal<Hogar[]>([]);
  private readonly zonasPorId = new Map<string, string>();

  protected readonly preguntando = signal(false);
  protected readonly error = signal('');
  protected readonly respuesta = signal<ConsultaOut | null>(null);

  protected readonly mostrarHistorial = signal(false);
  protected readonly cargandoHistorial = signal(false);
  protected readonly historial = signal<ConsultaFila[]>([]);

  constructor() {
    this.menorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    this.hogarId = this.route.snapshot.queryParamMap.get('hogar_id') ?? '';
    void this.cargarFiltros();
  }

  private async cargarFiltros(): Promise<void> {
    this.cargandoFiltros.set(true);
    try {
      const peticiones: Promise<void>[] = [
        firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`)).then((m) => this.menores.set(m)),
      ];
      if (this.puedeFiltrarPorHogar()) {
        peticiones.push(
          firstValueFrom(this.http.get<Zona[]>(`${this.config.apiUrl}/zonas-hogares/zonas`)).then((zonas) => {
            for (const z of zonas) this.zonasPorId.set(z.id, z.nombre);
          }),
        );
        peticiones.push(
          firstValueFrom(this.http.get<Hogar[]>(`${this.config.apiUrl}/zonas-hogares/hogares`)).then((h) =>
            this.hogares.set(h),
          ),
        );
      }
      await Promise.all(peticiones);
    } catch {
      // Los menús quedan vacíos; se puede seguir preguntando sin filtrar por menor u hogar.
    } finally {
      this.cargandoFiltros.set(false);
    }
  }

  protected etiquetaHogar(h: Hogar): string {
    const zona = this.zonasPorId.get(h.zona_id);
    return zona ? `Hogar de la zona ${zona}` : `Hogar ${h.id.slice(0, 8)}`;
  }

  protected async preguntar(): Promise<void> {
    this.preguntando.set(true);
    this.error.set('');
    try {
      const cuerpo: ConsultaCreate = {
        pregunta: this.pregunta,
        menor_id: this.menorId.trim() || null,
        hogar_id: this.hogarId.trim() || null,
      };
      this.respuesta.set(
        await firstValueFrom(this.http.post<ConsultaOut>(`${this.config.apiUrl}/ia/consultas`, cuerpo)),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.preguntando.set(false);
    }
  }

  protected async cargarHistorial(): Promise<void> {
    this.mostrarHistorial.set(true);
    this.cargandoHistorial.set(true);
    this.error.set('');
    try {
      this.historial.set(await firstValueFrom(this.http.get<ConsultaFila[]>(`${this.config.apiUrl}/ia/consultas`)));
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  protected esMetadatosSolo(h: ConsultaFila): boolean {
    return !('pregunta' in h);
  }

  protected preguntaDe(h: ConsultaFila): string {
    return 'pregunta' in h ? h.pregunta : '';
  }

  protected respuestaDe(h: ConsultaFila): string {
    return 'respuesta' in h ? h.respuesta : '';
  }

  protected fragmentosDe(c: ConsultaOut): Record<string, unknown>[] {
    return (c.fragmentos_usados ?? []) as Record<string, unknown>[];
  }

  protected textoFragmento(f: Record<string, unknown>): string {
    if (typeof f['texto'] === 'string') return f['texto'];
    const categoria = typeof f['categoria'] === 'string' ? f['categoria'] : '';
    const fecha = typeof f['fecha'] === 'string' ? f['fecha'] : '';
    const texto = [categoria, fecha].filter(Boolean).join(' — ');
    return texto || 'Fuente citada sin detalle';
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta consulta.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
