import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Zona = components['schemas']['ZonaOut'];
type Hogar = components['schemas']['HogarOut'];
type EstadoHogar = components['schemas']['EstadoHogar'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Zonas y Hogares: lista de zonas y, al elegir una, los hogares de esa zona. Roles coordinador/admin. */
@Component({
  selector: 'app-zonas-hogares',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Zonas y Hogares</h1>

    <section class="tarjeta">
      <h2>Zonas</h2>
      @if (cargandoZonas()) {
        <p class="nota">Cargando zonas...</p>
      }
      @if (errorZonas()) {
        <p class="error" role="alert">{{ errorZonas() }}</p>
      }
      <ul class="lista-simple">
        @for (z of zonas(); track z.id) {
          <li>
            <button type="button" [class.activo]="zonaSeleccionada()?.id === z.id" (click)="seleccionarZona(z)">
              {{ z.nombre }}
            </button>
          </li>
        }
      </ul>

      <form class="formulario" (ngSubmit)="crearZona()" #fz="ngForm">
        <label for="nombreZona">Nombre de la nueva zona</label>
        <input id="nombreZona" name="nombreZona" required [(ngModel)]="nuevaZonaNombre" />
        <label for="descZona">Descripción (opcional)</label>
        <input id="descZona" name="descZona" [(ngModel)]="nuevaZonaDescripcion" />
        <button type="submit" [disabled]="fz.invalid || guardandoZona()">
          {{ guardandoZona() ? 'Guardando...' : 'Crear zona' }}
        </button>
      </form>
    </section>

    @if (zonaSeleccionada()) {
      <section class="tarjeta">
        <h2>Hogares en {{ zonaSeleccionada()!.nombre }}</h2>
        <p>
          <a [routerLink]="['/reportes', 'zona', zonaSeleccionada()!.id]">Ver reporte de esta zona</a>
        </p>
        @if (cargandoHogares()) {
          <p class="nota">Cargando hogares...</p>
        }
        @if (errorHogares()) {
          <p class="error" role="alert">{{ errorHogares() }}</p>
        }
        <ul class="lista-simple">
          @for (h of hogares(); track h.id) {
            <li class="tarjeta">
              <p>Capacidad máxima: {{ h.capacidad_maxima }}</p>
              <p>Estado: {{ h.estado }}</p>
              <p>Madre asignada: {{ h.madre_id || 'Sin asignar' }}</p>
              <p>
                <a [routerLink]="['/inventario']" [queryParams]="{ hogar_id: h.id }">Inventario</a>
                ·
                <a [routerLink]="['/alimentos']" [queryParams]="{ hogar_id: h.id }">Control de alimentos</a>
              </p>
              <form class="formulario" (ngSubmit)="actualizarHogar(h)">
                <label [for]="'estado-' + h.id">Cambiar estado</label>
                <select [id]="'estado-' + h.id" name="estado" [(ngModel)]="estadoEdicion[h.id]">
                  <option value="activo">Activo</option>
                  <option value="inactivo">Inactivo</option>
                  <option value="suspendido">Suspendido</option>
                </select>
                <label [for]="'madre-' + h.id">Id de la madre (opcional)</label>
                <input [id]="'madre-' + h.id" name="madre" [(ngModel)]="madreEdicion[h.id]" />
                <button type="submit" [disabled]="guardandoHogarId() === h.id">
                  {{ guardandoHogarId() === h.id ? 'Guardando...' : 'Guardar cambios' }}
                </button>
              </form>
            </li>
          }
          @if (!cargandoHogares() && hogares().length === 0) {
            <p class="nota">Esta zona todavía no tiene hogares.</p>
          }
        </ul>

        <form class="formulario" (ngSubmit)="crearHogar()" #fh="ngForm">
          <h3>Crear hogar en esta zona</h3>
          <label for="capacidad">Capacidad máxima</label>
          <input id="capacidad" name="capacidad" type="number" min="1" max="13" required [(ngModel)]="nuevaCapacidad" />
          <button type="submit" [disabled]="fh.invalid || guardandoHogar()">
            {{ guardandoHogar() ? 'Guardando...' : 'Crear hogar' }}
          </button>
        </form>
      </section>
    }
  `,
})
export class ZonasHogares {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly zonas = signal<Zona[]>([]);
  protected readonly cargandoZonas = signal(false);
  protected readonly errorZonas = signal('');
  protected readonly guardandoZona = signal(false);
  protected nuevaZonaNombre = '';
  protected nuevaZonaDescripcion = '';

  protected readonly zonaSeleccionada = signal<Zona | null>(null);
  protected readonly hogares = signal<Hogar[]>([]);
  protected readonly cargandoHogares = signal(false);
  protected readonly errorHogares = signal('');
  protected readonly guardandoHogar = signal(false);
  protected readonly guardandoHogarId = signal<string | null>(null);
  protected nuevaCapacidad = 6;
  protected readonly estadoEdicion: Record<string, EstadoHogar> = {};
  protected readonly madreEdicion: Record<string, string> = {};

  constructor() {
    void this.cargarZonas();
  }

  private async cargarZonas(): Promise<void> {
    this.cargandoZonas.set(true);
    this.errorZonas.set('');
    try {
      this.zonas.set(
        await firstValueFrom(this.http.get<Zona[]>(`${this.config.apiUrl}/zonas-hogares/zonas`)),
      );
    } catch {
      this.errorZonas.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoZonas.set(false);
    }
  }

  protected async crearZona(): Promise<void> {
    if (!this.nuevaZonaNombre.trim()) return;
    this.guardandoZona.set(true);
    this.errorZonas.set('');
    try {
      const creada = await firstValueFrom(
        this.http.post<Zona>(`${this.config.apiUrl}/zonas-hogares/zonas`, {
          nombre: this.nuevaZonaNombre,
          descripcion: this.nuevaZonaDescripcion || null,
        }),
      );
      this.zonas.set([...this.zonas(), creada]);
      this.nuevaZonaNombre = '';
      this.nuevaZonaDescripcion = '';
    } catch {
      this.errorZonas.set(MENSAJE_GENERICO);
    } finally {
      this.guardandoZona.set(false);
    }
  }

  protected seleccionarZona(z: Zona): void {
    this.zonaSeleccionada.set(z);
    void this.cargarHogares(z.id);
  }

  private async cargarHogares(zonaId: string): Promise<void> {
    this.cargandoHogares.set(true);
    this.errorHogares.set('');
    try {
      const hogares = await firstValueFrom(
        this.http.get<Hogar[]>(`${this.config.apiUrl}/zonas-hogares/hogares`, { params: { zona_id: zonaId } }),
      );
      this.hogares.set(hogares);
      for (const h of hogares) {
        this.estadoEdicion[h.id] = h.estado as EstadoHogar;
        this.madreEdicion[h.id] = h.madre_id ?? '';
      }
    } catch {
      this.errorHogares.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoHogares.set(false);
    }
  }

  protected async crearHogar(): Promise<void> {
    const zona = this.zonaSeleccionada();
    if (!zona) return;
    this.guardandoHogar.set(true);
    this.errorHogares.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<Hogar>(`${this.config.apiUrl}/zonas-hogares/hogares`, {
          zona_id: zona.id,
          capacidad_maxima: this.nuevaCapacidad,
        }),
      );
      this.hogares.set([...this.hogares(), creado]);
      this.estadoEdicion[creado.id] = creado.estado as EstadoHogar;
      this.madreEdicion[creado.id] = creado.madre_id ?? '';
    } catch (error) {
      this.errorHogares.set(this.mensajeError(error));
    } finally {
      this.guardandoHogar.set(false);
    }
  }

  protected async actualizarHogar(h: Hogar): Promise<void> {
    this.guardandoHogarId.set(h.id);
    this.errorHogares.set('');
    try {
      const madreId = this.madreEdicion[h.id]?.trim();
      const actualizado = await firstValueFrom(
        this.http.put<Hogar>(`${this.config.apiUrl}/zonas-hogares/hogares/${h.id}`, {
          estado: this.estadoEdicion[h.id],
          madre_id: madreId || null,
        }),
      );
      this.hogares.set(this.hogares().map((x) => (x.id === actualizado.id ? actualizado : x)));
    } catch (error) {
      this.errorHogares.set(this.mensajeError(error));
    } finally {
      this.guardandoHogarId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
