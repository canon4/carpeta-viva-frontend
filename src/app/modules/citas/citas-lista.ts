import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import { SelectorMenor } from '../../shared/selector-menor/selector-menor';
import type { components } from '../../core/api/schema';

// El generador de tipos distingue este `CitaOut` (citas y recordatorios) del homónimo agregado
// en el módulo `ia` (cita a una fuente documental, Fase 5) porque ambos backends usan el mismo
// nombre de clase en módulos distintos.
type Cita = components['schemas']['app__modules__citas__schemas__CitaOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

const ETIQUETAS_TIPO: Record<string, string> = {
  medica: 'Médica',
  psicosocial: 'Psicosocial',
  reunion_familia: 'Reunión con familia biológica',
  otro: 'Otro',
};

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  cumplida: 'Cumplida',
  no_asistio: 'No asistió',
};

/**
 * Citas y Recordatorios de un menor: el sistema no asigna citas, solo las recuerda (RF15).
 * El campo `notas` puede llegar `null` cuando el backend determina que el usuario no tiene
 * permiso de sección para el tipo de esa cita (ADR-0009, sección 2): se muestra un mensaje
 * explícito, nunca un campo vacío ambiguo.
 */
@Component({
  selector: 'app-citas-lista',
  imports: [FormsModule, SelectorMenor],
  template: `
    <h1>Citas y Recordatorios</h1>

    <form class="formulario" (ngSubmit)="filtrar()">
      <app-selector-menor [(valor)]="filtroMenorId" etiqueta="Menor (opcional)" opcionVacia="Todos los menores" />
      <label for="fTipo">Tipo (opcional)</label>
      <select id="fTipo" name="fTipo" [(ngModel)]="filtroTipo">
        <option value="">Todos</option>
        <option value="medica">Médica</option>
        <option value="psicosocial">Psicosocial</option>
        <option value="reunion_familia">Reunión con familia biológica</option>
        <option value="otro">Otro</option>
      </select>
      <label for="fEstado">Estado (opcional)</label>
      <select id="fEstado" name="fEstado" [(ngModel)]="filtroEstado">
        <option value="">Todos</option>
        <option value="pendiente">Pendiente</option>
        <option value="cumplida">Cumplida</option>
        <option value="no_asistio">No asistió</option>
      </select>
      <button type="submit" [disabled]="cargando()">Filtrar</button>
      <button type="button" (click)="verProximas()" [disabled]="cargando()">Ver mis próximas citas</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando citas...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (c of citas(); track c.id) {
        <li class="tarjeta">
          <p><strong>{{ etiquetaTipo(c.tipo) }}</strong> — {{ etiquetaEstado(c.estado) }}</p>
          <p>Fecha y hora: {{ c.fecha_hora }}</p>
          <p>Lugar: {{ c.lugar || 'Sin registrar' }}</p>
          <p>
            Notas:
            {{ c.notas === null ? 'Sin acceso a las notas de esta cita.' : (c.notas || 'Sin notas registradas.') }}
          </p>

          @if (c.estado === 'pendiente') {
            <button type="button" (click)="cambiarEstado(c, 'cumplida')" [disabled]="guardandoId() === c.id">
              Marcar cumplida
            </button>
            <button type="button" (click)="cambiarEstado(c, 'no_asistio')" [disabled]="guardandoId() === c.id">
              Marcar no asistió
            </button>
          }
        </li>
      }
      @if (!cargando() && citas().length === 0) {
        <p class="nota">No hay citas para mostrar con estos filtros.</p>
      }
    </ul>

    <form class="formulario tarjeta" (ngSubmit)="crear()" #f="ngForm">
      <h2>Registrar cita</h2>
      <app-selector-menor [(valor)]="nueva.menor_id" [requerido]="true" />
      <label for="nTipo">Tipo</label>
      <select id="nTipo" name="nTipo" required [(ngModel)]="nueva.tipo">
        <option value="medica">Médica</option>
        <option value="psicosocial">Psicosocial</option>
        <option value="reunion_familia">Reunión con familia biológica</option>
        <option value="otro">Otro</option>
      </select>
      <label for="nFechaHora">Fecha y hora</label>
      <input id="nFechaHora" name="nFechaHora" type="datetime-local" required [(ngModel)]="nueva.fecha_hora" />
      <label for="nLugar">Lugar (opcional)</label>
      <input id="nLugar" name="nLugar" [(ngModel)]="nueva.lugar" />
      <label for="nNotas">Notas de logística (opcional, p. ej. "traer carné de vacunas")</label>
      <input id="nNotas" name="nNotas" [(ngModel)]="nueva.notas" />
      <p class="nota">
        Las notas son para logística, no para contenido clínico o psicosocial: ese contenido se
        registra en Gestión Documental.
      </p>
      <button type="submit" [disabled]="f.invalid || guardando()">
        {{ guardando() ? 'Guardando...' : 'Registrar cita' }}
      </button>
    </form>
  `,
})
export class CitasLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);

  protected readonly etiquetaTipo = (t: string) => ETIQUETAS_TIPO[t] ?? t;
  protected readonly etiquetaEstado = (e: string) => ETIQUETAS_ESTADO[e] ?? e;

  protected readonly citas = signal<Cita[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly guardandoId = signal<string | null>(null);

  protected filtroMenorId = '';
  protected filtroTipo = '';
  protected filtroEstado = '';

  protected nueva: { menor_id: string; tipo: string; fecha_hora: string; lugar: string; notas: string } = {
    menor_id: '',
    tipo: 'medica',
    fecha_hora: '',
    lugar: '',
    notas: '',
  };

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    if (this.filtroMenorId) this.nueva.menor_id = this.filtroMenorId;
    void this.cargar();
  }

  protected filtrar(): void {
    void this.cargar();
  }

  protected verProximas(): void {
    void this.cargar(true);
  }

  private async cargar(proximas = false): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      if (proximas) {
        this.citas.set(await firstValueFrom(this.http.get<Cita[]>(`${this.config.apiUrl}/citas/proximas`)));
      } else {
        const params: Record<string, string> = {};
        if (this.filtroMenorId.trim()) params['menor_id'] = this.filtroMenorId.trim();
        if (this.filtroTipo) params['tipo'] = this.filtroTipo;
        if (this.filtroEstado) params['estado'] = this.filtroEstado;
        this.citas.set(await firstValueFrom(this.http.get<Cita[]>(`${this.config.apiUrl}/citas`, { params })));
      }
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crear(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const fechaIso = this.nueva.fecha_hora ? new Date(this.nueva.fecha_hora).toISOString() : '';
      const creada = await firstValueFrom(
        this.http.post<Cita>(`${this.config.apiUrl}/citas`, {
          menor_id: this.nueva.menor_id,
          tipo: this.nueva.tipo,
          fecha_hora: fechaIso,
          lugar: this.nueva.lugar || null,
          notas: this.nueva.notas || null,
        }),
      );
      this.citas.set([creada, ...this.citas()]);
      this.nueva = { menor_id: this.nueva.menor_id, tipo: 'medica', fecha_hora: '', lugar: '', notas: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async cambiarEstado(c: Cita, estado: 'cumplida' | 'no_asistio'): Promise<void> {
    this.guardandoId.set(c.id);
    this.error.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Cita>(`${this.config.apiUrl}/citas/${c.id}/estado`, { estado }),
      );
      this.citas.set(this.citas().map((x) => (x.id === actualizada.id ? actualizada : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta acción.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
