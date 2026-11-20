import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
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
    <div class="encabezado-modulo">
      <h1>Madres sustitutas</h1>
      @if (!formularioAbierto()) {
        <button type="button" (click)="formularioAbierto.set(true)">Registrar madre</button>
      }
    </div>

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="crear()" #f="ngForm" aria-labelledby="tituloMadre">
        <h2 id="tituloMadre">Registrar madre sustituta</h2>
        <div class="campos">
          <div class="campo">
            <label for="nombres">Nombres *</label>
            <input id="nombres" name="nombres" required autocomplete="off" [(ngModel)]="nuevo.nombres" />
          </div>
          <div class="campo">
            <label for="apellidos">Apellidos *</label>
            <input id="apellidos" name="apellidos" required autocomplete="off" [(ngModel)]="nuevo.apellidos" />
          </div>
          <div class="campo">
            <label for="identificacion">Cédula *</label>
            <input id="identificacion" name="identificacion" required inputmode="numeric" autocomplete="off" [(ngModel)]="nuevo.numero_identificacion" />
          </div>
          <div class="campo">
            <label for="telefono">Teléfono</label>
            <input id="telefono" name="telefono" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="nuevo.telefono" />
          </div>
          <div class="campo">
            <label for="direccion">Dirección</label>
            <input id="direccion" name="direccion" autocomplete="off" [(ngModel)]="nuevo.direccion" />
          </div>
        </div>
        <p class="nota">Los campos con * son obligatorios.</p>
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardandoNueva()">{{ guardandoNueva() ? 'Guardando...' : 'Guardar' }}</button>
          <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
        </div>
      </form>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="filtros">
      <div class="campo">
        <label for="buscar">Buscar</label>
        <input id="buscar" type="search" autocomplete="off" placeholder="Nombre o cédula" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" />
      </div>
    </div>

    @if (cargando()) {
      <p class="nota" role="status">Cargando madres...</p>
    } @else if (filtradas().length === 0) {
      <p class="nota">No hay madres para mostrar.</p>
    } @else {
      <table class="tabla-datos" aria-label="Madres sustitutas">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Cédula</th>
            <th scope="col">Teléfono</th>
            <th scope="col">Certificación</th>
          </tr>
        </thead>
        <tbody>
          @for (m of filtradas(); track m.id) {
            <tr>
              <td data-etiqueta="Nombre"><strong>{{ m.nombres }} {{ m.apellidos }}</strong><br /><span class="nota">{{ m.direccion || 'Sin dirección' }}</span></td>
              <td data-etiqueta="Cédula">{{ m.numero_identificacion }}</td>
              <td data-etiqueta="Teléfono">
                @if (m.telefono) { <a [href]="'tel:' + m.telefono">{{ m.telefono }}</a> } @else { — }
              </td>
              <td data-etiqueta="Certificación">
                <label class="oculto" [for]="'estado-' + m.id">Certificación de {{ m.nombres }}</label>
                <select [id]="'estado-' + m.id" [ngModel]="estadoEdicion[m.id]" (ngModelChange)="estadoEdicion[m.id] = $event; actualizarEstado(m)" [disabled]="guardandoId() === m.id">
                  <option value="pendiente">Pendiente</option>
                  <option value="vigente">Vigente</option>
                  <option value="vencida">Vencida</option>
                  <option value="suspendida">Suspendida</option>
                </select>
              </td>
            </tr>
          }
        </tbody>
      </table>
      <p class="nota">El cambio de certificación se guarda al elegirlo.</p>
    }
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
  protected readonly formularioAbierto = signal(false);
  protected readonly busqueda = signal('');
  protected readonly filtradas = computed(() => {
    const texto = this.busqueda().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const lista = [...this.madres()].sort((a, b) => `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`, 'es'));
    if (!texto) return lista;
    return lista.filter((m) =>
      `${m.nombres} ${m.apellidos} ${m.numero_identificacion}`.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(texto),
    );
  });
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
      this.formularioAbierto.set(false);
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
