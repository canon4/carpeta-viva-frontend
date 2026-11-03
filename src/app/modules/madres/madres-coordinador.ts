import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Madre = components['schemas']['MadreOut'];
type EstadoCertificacion = components['schemas']['EstadoCertificacion'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Lista de madres sustitutas y edición de su estado de certificación. Roles coordinador/admin. */
@Component({
  selector: 'app-madres-coordinador',
  imports: [FormsModule],
  template: `
    <h1>Madres Sustitutas</h1>

    @if (cargando()) {
      <p class="nota">Cargando madres...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (m of madres(); track m.id) {
        <li class="tarjeta">
          <h2>{{ m.nombres }} {{ m.apellidos }}</h2>
          <p>Identificación: {{ m.numero_identificacion }}</p>
          <p>Teléfono: {{ m.telefono || 'Sin registrar' }}</p>
          <p>Dirección: {{ m.direccion || 'Sin registrar' }}</p>
          <form class="formulario" (ngSubmit)="actualizarEstado(m)">
            <label [for]="'estado-' + m.id">Estado de certificación</label>
            <select [id]="'estado-' + m.id" name="estado" [(ngModel)]="estadoEdicion[m.id]">
              <option value="pendiente">Pendiente</option>
              <option value="vigente">Vigente</option>
              <option value="vencida">Vencida</option>
              <option value="suspendida">Suspendida</option>
            </select>
            <button type="submit" [disabled]="guardandoId() === m.id">
              {{ guardandoId() === m.id ? 'Guardando...' : 'Guardar' }}
            </button>
          </form>
        </li>
      }
      @if (!cargando() && madres().length === 0) {
        <p class="nota">Todavía no hay madres registradas.</p>
      }
    </ul>

    <form class="formulario tarjeta" (ngSubmit)="crear()" #f="ngForm">
      <h2>Registrar madre sustituta</h2>
      <label for="nombres">Nombres</label>
      <input id="nombres" name="nombres" required [(ngModel)]="nuevo.nombres" />
      <label for="apellidos">Apellidos</label>
      <input id="apellidos" name="apellidos" required [(ngModel)]="nuevo.apellidos" />
      <label for="identificacion">Número de identificación</label>
      <input id="identificacion" name="identificacion" required [(ngModel)]="nuevo.numero_identificacion" />
      <label for="telefono">Teléfono</label>
      <input id="telefono" name="telefono" [(ngModel)]="nuevo.telefono" />
      <label for="direccion">Dirección</label>
      <input id="direccion" name="direccion" [(ngModel)]="nuevo.direccion" />
      <button type="submit" [disabled]="f.invalid || guardandoNueva()">
        {{ guardandoNueva() ? 'Guardando...' : 'Crear madre' }}
      </button>
    </form>
  `,
})
export class MadresCoordinador {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly madres = signal<Madre[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardandoId = signal<string | null>(null);
  protected readonly guardandoNueva = signal(false);
  protected readonly estadoEdicion: Record<string, EstadoCertificacion> = {};

  protected nuevo = {
    nombres: '',
    apellidos: '',
    numero_identificacion: '',
    telefono: '',
    direccion: '',
  };

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const madres = await firstValueFrom(this.http.get<Madre[]>(`${this.config.apiUrl}/madres`));
      this.madres.set(madres);
      for (const m of madres) {
        this.estadoEdicion[m.id] = m.estado_certificacion as EstadoCertificacion;
      }
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crear(): Promise<void> {
    this.guardandoNueva.set(true);
    this.error.set('');
    try {
      const creada = await firstValueFrom(
        this.http.post<Madre>(`${this.config.apiUrl}/madres`, {
          nombres: this.nuevo.nombres,
          apellidos: this.nuevo.apellidos,
          numero_identificacion: this.nuevo.numero_identificacion,
          telefono: this.nuevo.telefono || null,
          direccion: this.nuevo.direccion || null,
        }),
      );
      this.madres.set([...this.madres(), creada]);
      this.estadoEdicion[creada.id] = creada.estado_certificacion as EstadoCertificacion;
      this.nuevo = { nombres: '', apellidos: '', numero_identificacion: '', telefono: '', direccion: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoNueva.set(false);
    }
  }

  protected async actualizarEstado(m: Madre): Promise<void> {
    this.guardandoId.set(m.id);
    this.error.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Madre>(`${this.config.apiUrl}/madres/${m.id}`, {
          estado_certificacion: this.estadoEdicion[m.id],
        }),
      );
      this.madres.set(this.madres().map((x) => (x.id === actualizada.id ? actualizada : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
