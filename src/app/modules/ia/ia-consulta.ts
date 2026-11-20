import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { TextoIaPipe } from '../../shared/texto-ia.pipe';

type ConsultaCreate = components['schemas']['ConsultaCreate'];
type ConsultaOut = components['schemas']['ConsultaOut'];
type ConsultaMetadatosOut = components['schemas']['ConsultaMetadatosOut'];
type ConsultaFila = ConsultaOut | ConsultaMetadatosOut;
type Menor = components['schemas']['MenorOut'];
type Hogar = components['schemas']['HogarOut'];
type Zona = components['schemas']['ZonaOut'];

/** Un turno del chat: la pregunta del usuario y lo que respondió (o está respondiendo) el asistente. */
interface Mensaje {
  clave: string;
  pregunta: string;
  fecha: string;
  estado: 'cargando' | 'listo' | 'error';
  respuesta: ConsultaOut | null;
  error: string;
  /** Rol auditor: el historial trae solo metadatos, nunca pregunta ni respuesta. */
  metadatos: { proveedor: string; modelo: string } | null;
}

const MENSAJE_GENERICO = 'No se pudo completar la consulta. Intente de nuevo.';
const HISTORIAL_VISIBLE = 20;

/**
 * Chat del asistente en lenguaje natural (ADR-0010 sección 1, sin módulo aparte). Solo busca entre
 * lo que el usuario puede ver y siempre cita la fuente (documento/versión/categoría/fecha, nunca el
 * nombre real del NNA o de la madre en la cita). Si no hay fuente, avisa que no sabe y no llama al
 * modelo externo. Las consultas anteriores del usuario se muestran como mensajes previos del hilo.
 */
@Component({
  selector: 'app-ia-consulta',
  imports: [FormsModule, RouterLink, TextoIaPipe],
  template: `
    <div class="chat">
      <header class="chat__encabezado">
        <div class="chat__titulo">
          <span class="avatar avatar--ia" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/></svg>
          </span>
          <div>
            <h1>Asistente de IA</h1>
            <p class="nota">Solo busca en lo que usted puede ver y cita la fuente de cada dato.</p>
          </div>
        </div>
        <div class="acciones-fila">
          @if (mensajes().length > 0) {
            <button type="button" class="boton-secundario" (click)="nuevaConversacion()" [disabled]="enviando()">Nueva conversación</button>
          }
          @if (puedeRedactar()) {
            <a class="boton-secundario enlace-boton" routerLink="/ia/redaccion">Apoyo a la redacción</a>
          }
          @if (esAdmin()) {
            <a class="boton-secundario enlace-boton" routerLink="/configuracion" [queryParams]="{ seccion: 'ia' }">Configuración</a>
          }
        </div>
      </header>

      <div class="chat__contexto">
        <label for="menorIdCtx" class="nota">Sobre</label>
        <select id="menorIdCtx" name="menorIdCtx" [(ngModel)]="menorId" [disabled]="enviando() || cargandoFiltros()">
          <option value="">Todos mis menores</option>
          @for (m of menores(); track m.id) {
            <option [value]="m.id">{{ m.nombres }} {{ m.apellidos }}</option>
          }
        </select>
        @if (puedeFiltrarPorHogar()) {
          <select id="hogarIdCtx" name="hogarIdCtx" aria-label="Hogar" [(ngModel)]="hogarId" [disabled]="enviando() || cargandoFiltros()">
            <option value="">Todos los hogares</option>
            @for (h of hogares(); track h.id) {
              <option [value]="h.id">{{ etiquetaHogar(h) }}</option>
            }
          </select>
        }
      </div>

      <div class="chat__hilo" #hilo role="log" aria-live="polite" aria-label="Conversación con el asistente">
        @if (cargandoHistorial()) {
          <p class="nota chat__aviso">Cargando conversaciones anteriores...</p>
        } @else if (mensajes().length === 0) {
          <div class="chat__vacio">
            <p><strong>¿En qué le ayudo?</strong></p>
            <p class="nota">Pregunte en palabras sencillas o elija un ejemplo.</p>
            <div class="sugerencias">
              @for (s of sugerencias; track s) {
                <button type="button" class="chip" (click)="enviar(s)">{{ s }}</button>
              }
            </div>
          </div>
        } @else {
          @if (hayHistorialOculto()) {
            <p class="nota chat__aviso">Se muestran sus {{ historialVisible }} consultas más recientes.</p>
          }
          @for (m of mensajes(); track m.clave) {
            @if (m.metadatos) {
              <p class="nota chat__aviso">Consulta del {{ fecha(m.fecha) }} · {{ m.metadatos.proveedor }} · {{ m.metadatos.modelo }} (solo metadatos)</p>
            } @else {
              <div class="fila fila--usuario">
                <div class="burbuja burbuja--usuario">
                  <p>{{ m.pregunta }}</p>
                  <span class="hora">{{ hora(m.fecha) }}</span>
                </div>
              </div>
              <div class="fila fila--ia">
                <span class="avatar avatar--ia avatar--chico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/></svg>
                </span>
                <div class="burbuja burbuja--ia">
                  @switch (m.estado) {
                    @case ('cargando') {
                      <span class="escribiendo" role="status" aria-label="El asistente está buscando"><i></i><i></i><i></i></span>
                    }
                    @case ('error') {
                      <p class="error">{{ m.error }}</p>
                      <button type="button" class="boton-secundario boton-chico" (click)="reintentar(m)" [disabled]="enviando()">Reintentar</button>
                    }
                    @default {
                      @if (m.respuesta?.sin_resultado) {
                        <p class="nota">No encontré información con una fuente confiable para responder. No envié la pregunta al asistente externo.</p>
                      } @else {
                        <p class="texto" [innerHTML]="m.respuesta?.respuesta | textoIa"></p>
                        @if (fragmentosDe(m.respuesta).length > 0) {
                          <details class="fuentes">
                            <summary>Fuentes ({{ fragmentosDe(m.respuesta).length }})</summary>
                            <ol>
                              @for (f of fragmentosDe(m.respuesta); track $index) {
                                <li>{{ textoFragmento(f) }}</li>
                              }
                            </ol>
                          </details>
                        } @else {
                          <p class="nota">Sin fuente concreta citada.</p>
                        }
                      }
                    }
                  }
                </div>
              </div>
            }
          }
        }
      </div>

      <form class="chat__compositor" (ngSubmit)="enviar()" #f="ngForm">
        <label for="pregunta" class="solo-lector">Su pregunta</label>
        <textarea
          id="pregunta"
          name="pregunta"
          rows="1"
          required
          [(ngModel)]="pregunta"
          (keydown.enter)="alPresionarEnter($event)"
          placeholder="Escriba su pregunta..."
        ></textarea>
        <button type="submit" class="enviar" [disabled]="!pregunta.trim() || enviando()" aria-label="Enviar pregunta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>
        </button>
      </form>
      <p class="nota chat__pie">Enter para enviar, Mayús + Enter para una línea nueva. Revise siempre la fuente antes de usar un dato.</p>
    </div>
  `,
})
export class IaConsulta {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly hilo = viewChild<ElementRef<HTMLElement>>('hilo');

  protected readonly esAdmin = computed(() => this.auth.rol() === 'admin');
  protected readonly puedeRedactar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor';
  });
  protected readonly puedeFiltrarPorHogar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  protected readonly sugerencias = [
    '¿Cuándo fue la última cita médica?',
    '¿Qué documentos faltan por revisar?',
    'Resuma el último informe psicosocial',
  ];
  protected readonly historialVisible = HISTORIAL_VISIBLE;

  protected pregunta = '';
  protected menorId = '';
  protected hogarId = '';

  protected readonly cargandoFiltros = signal(false);
  protected readonly menores = signal<Menor[]>([]);
  protected readonly hogares = signal<Hogar[]>([]);
  private readonly zonasPorId = new Map<string, string>();

  protected readonly mensajes = signal<Mensaje[]>([]);
  protected readonly enviando = signal(false);
  protected readonly cargandoHistorial = signal(true);
  protected readonly hayHistorialOculto = signal(false);
  private contador = 0;

  constructor() {
    this.menorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    this.hogarId = this.route.snapshot.queryParamMap.get('hogar_id') ?? '';
    void this.cargarFiltros();
    void this.cargarHistorial();
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
          firstValueFrom(this.http.get<Hogar[]>(`${this.config.apiUrl}/zonas-hogares/hogares`)).then((h) => this.hogares.set(h)),
        );
      }
      await Promise.all(peticiones);
    } catch {
      // Los menús quedan vacíos; se puede seguir preguntando sin filtrar por menor u hogar.
    } finally {
      this.cargandoFiltros.set(false);
    }
  }

  /** Las consultas anteriores del usuario se muestran como el inicio del hilo, de la más antigua a la más reciente. */
  private async cargarHistorial(): Promise<void> {
    try {
      const filas = await firstValueFrom(this.http.get<ConsultaFila[]>(`${this.config.apiUrl}/ia/consultas`));
      const ordenadas = [...filas].sort((a, b) => a.creado_en.localeCompare(b.creado_en));
      this.hayHistorialOculto.set(ordenadas.length > HISTORIAL_VISIBLE);
      // Si el usuario ya escribió mientras cargaba, sus mensajes nuevos quedan después del historial.
      this.mensajes.set([...ordenadas.slice(-HISTORIAL_VISIBLE).map((f) => this.desdeHistorial(f)), ...this.mensajes()]);
      this.bajar();
    } catch {
      // Sin historial el chat sigue funcionando.
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  private desdeHistorial(f: ConsultaFila): Mensaje {
    const base = { clave: `h-${f.id}`, fecha: f.creado_en, estado: 'listo' as const, error: '' };
    if (this.esMetadatosSolo(f)) {
      return { ...base, pregunta: '', respuesta: null, metadatos: { proveedor: f.proveedor, modelo: f.modelo } };
    }
    const completa = f as ConsultaOut;
    return { ...base, pregunta: completa.pregunta, respuesta: completa, metadatos: null };
  }

  protected etiquetaHogar(h: Hogar): string {
    const zona = this.zonasPorId.get(h.zona_id);
    return zona ? `Hogar de la zona ${zona}` : `Hogar ${h.id.slice(0, 8)}`;
  }

  protected alPresionarEnter(evento: Event): void {
    const tecla = evento as KeyboardEvent;
    if (tecla.shiftKey || tecla.isComposing) return;
    tecla.preventDefault();
    void this.enviar();
  }

  protected async enviar(texto?: string): Promise<void> {
    const pregunta = (texto ?? this.pregunta).trim();
    if (!pregunta || this.enviando()) return;
    this.pregunta = '';
    const mensaje: Mensaje = {
      clave: `n-${++this.contador}`,
      pregunta,
      fecha: new Date().toISOString(),
      estado: 'cargando',
      respuesta: null,
      error: '',
      metadatos: null,
    };
    this.mensajes.set([...this.mensajes(), mensaje]);
    await this.consultar(mensaje);
  }

  protected async reintentar(m: Mensaje): Promise<void> {
    this.actualizar(m.clave, { estado: 'cargando', error: '' });
    await this.consultar(m);
  }

  private async consultar(m: Mensaje): Promise<void> {
    this.enviando.set(true);
    this.bajar();
    try {
      const cuerpo: ConsultaCreate = {
        pregunta: m.pregunta,
        menor_id: this.menorId.trim() || null,
        hogar_id: this.hogarId.trim() || null,
      };
      const respuesta = await firstValueFrom(this.http.post<ConsultaOut>(`${this.config.apiUrl}/ia/consultas`, cuerpo));
      this.actualizar(m.clave, { estado: 'listo', respuesta });
    } catch (e) {
      this.actualizar(m.clave, { estado: 'error', error: this.mensajeError(e) });
    } finally {
      this.enviando.set(false);
      this.bajar();
    }
  }

  protected nuevaConversacion(): void {
    // Solo limpia la vista: las consultas siguen guardadas y auditadas en el servidor.
    this.mensajes.set([]);
    this.hayHistorialOculto.set(false);
  }

  private actualizar(clave: string, cambios: Partial<Mensaje>): void {
    this.mensajes.set(this.mensajes().map((m) => (m.clave === clave ? { ...m, ...cambios } : m)));
  }

  private bajar(): void {
    setTimeout(() => {
      const el = this.hilo()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  protected hora(iso: string): string {
    const d = new Date(iso);
    const hoy = new Date().toDateString() === d.toDateString();
    return hoy
      ? d.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' })
      : this.fecha(iso);
  }

  protected esMetadatosSolo(h: ConsultaFila): h is ConsultaMetadatosOut {
    return !('pregunta' in h);
  }

  protected fragmentosDe(c: ConsultaOut | null): Record<string, unknown>[] {
    return (c?.fragmentos_usados ?? []) as Record<string, unknown>[];
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
