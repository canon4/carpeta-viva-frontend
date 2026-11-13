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
    <div class="modulo-container">
      <!-- Encabezado del Módulo -->
      <header class="modulo-header">
        <div class="titulo-con-icono">
          <div class="icono-titulo-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <h1>Zonas y Hogares</h1>
            <p class="subtitulo">Gestión de territorios y hogares sustitutos del sistema</p>
          </div>
        </div>
      </header>

      <!-- Panel de Zonas -->
      <section class="seccion-tarjeta">
        <h2>Territorios / Zonas</h2>

        @if (cargandoZonas()) {
          <p class="nota">Cargando zonas...</p>
        }
        @if (errorZonas()) {
          <p class="error" role="alert">{{ errorZonas() }}</p>
        }

        <!-- Botones de Zonas en formato grid moderno -->
        <div class="grid-zonas">
          @for (z of zonas(); track z.id) {
            <button 
              type="button" 
              class="btn-zona" 
              [class.activo]="zonaSeleccionada()?.id === z.id" 
              (click)="seleccionarZona(z)">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                <circle cx="12" cy="10" r="3"></circle>
              </svg>
              <span>{{ z.nombre }}</span>
            </button>
          }
        </div>

        <!-- Formulario para Crear Zona -->
        <form class="formulario-estilizado" (ngSubmit)="crearZona()" #fz="ngForm">
          <h3>Registrar nueva zona</h3>
          <div class="form-row">
            <div class="campo-grupo">
              <label for="nombreZona">Nombre de la nueva zona</label>
              <input id="nombreZona" name="nombreZona" placeholder="Ej. Zona Norte" required [(ngModel)]="nuevaZonaNombre" />
            </div>
            <div class="campo-grupo">
              <label for="descZona">Descripción (opcional)</label>
              <input id="descZona" name="descZona" placeholder="Detalles del sector" [(ngModel)]="nuevaZonaDescripcion" />
            </div>
          </div>
          <button type="submit" class="btn-principal" [disabled]="fz.invalid || guardandoZona()">
            {{ guardandoZona() ? 'Guardando...' : 'Crear zona' }}
          </button>
        </form>
      </section>

      <!-- Panel de Hogares (Visible al seleccionar una zona) -->
      @if (zonaSeleccionada()) {
        <section class="seccion-tarjeta highlight">
          <div class="zona-detalle-header">
            <div>
              <h2>Hogares en {{ zonaSeleccionada()!.nombre }}</h2>
              <p class="subtitulo">Administración y control de cupos por hogar</p>
            </div>
            <a class="enlace-reporte" [routerLink]="['/reportes', 'zona', zonaSeleccionada()!.id]">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
              Ver reporte de esta zona
            </a>
          </div>

          @if (cargandoHogares()) {
            <p class="nota">Cargando hogares...</p>
          }
          @if (errorHogares()) {
            <p class="error" role="alert">{{ errorHogares() }}</p>
          }

          <!-- Tarjetas de Hogares -->
          <div class="grid-hogares">
            @for (h of hogares(); track h.id) {
              <div class="tarjeta-hogar">
                <div class="hogar-info-top">
                  <div class="hogar-badge">Hogar ID: {{ h.id.slice(0, 8) }}...</div>
                  <span class="estado-tag" [class.activo]="h.estado === 'activo'" [class.inactivo]="h.estado === 'inactivo'">
                    {{ h.estado }}
                  </span>
                </div>
                
                <div class="hogar-datos">
                  <p><strong>Capacidad máxima:</strong> {{ h.capacidad_maxima }}</p>
                  <p><strong>Madre asignada:</strong> {{ h.madre_id || 'Sin asignar' }}</p>
                </div>

                <div class="hogar-enlaces-rapidos">
                  <a [routerLink]="['/inventario']" [queryParams]="{ hogar_id: h.id }">Inventario</a>
                  <span>·</span>
                  <a [routerLink]="['/alimentos']" [queryParams]="{ hogar_id: h.id }">Control de alimentos</a>
                </div>

                <form class="formulario-edicion" (ngSubmit)="actualizarHogar(h)">
                  <div class="campo-grupo">
                    <label [for]="'estado-' + h.id">Cambiar estado</label>
                    <select [id]="'estado-' + h.id" name="estado" [(ngModel)]="estadoEdicion[h.id]">
                      <option value="activo">Activo</option>
                      <option value="inactivo">Inactivo</option>
                      <option value="suspendido">Suspendido</option>
                    </select>
                  </div>

                  <div class="campo-grupo">
                    <label [for]="'madre-' + h.id">Id de la madre (opcional)</label>
                    <input [id]="'madre-' + h.id" name="madre" placeholder="ID de usuario" [(ngModel)]="madreEdicion[h.id]" />
                  </div>

                  <button type="submit" class="btn-secundario" [disabled]="guardandoHogarId() === h.id">
                    {{ guardandoHogarId() === h.id ? 'Guardando...' : 'Guardar cambios' }}
                  </button>
                </form>
              </div>
            }

            @if (!cargandoHogares() && hogares().length === 0) {
              <p class="nota vacio">Esta zona todavía no tiene hogares registrados.</p>
            }
          </div>

          <!-- Formulario para Crear Hogar -->
          <form class="formulario-estilizado inline-form" (ngSubmit)="crearHogar()" #fh="ngForm">
            <h3>Crear hogar en esta zona</h3>
            <div class="form-row-inline">
              <div class="campo-grupo">
                <label for="capacidad">Capacidad máxima (1-13)</label>
                <input id="capacidad" name="capacidad" type="number" min="1" max="13" required [(ngModel)]="nuevaCapacidad" />
              </div>
              <button type="submit" class="btn-principal" [disabled]="fh.invalid || guardandoHogar()">
                {{ guardandoHogar() ? 'Guardando...' : 'Crear hogar' }}
              </button>
            </div>
          </form>
        </section>
      }
    </div>
  `,
  styles: [`
    :host {
      --turquesa-principal: #18A999;
      --turquesa-oscuro: #0d7a6e;
      --turquesa-suave: #E3F5F1;
      --coral: #FF7F6B;
      --coral-suave: #FFF0ED;
      --texto-principal: #344B49;
    }

    .modulo-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      padding-bottom: 3rem;
    }

    .modulo-header {
      background: #FFFFFF;
      border: 1px solid #e1e7ec;
      border-radius: 16px;
      padding: 1.75rem 2rem;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.02);
    }

    .titulo-con-icono {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .icono-titulo-wrapper {
      width: 48px;
      height: 48px;
      background: var(--turquesa-suave);
      color: var(--turquesa-principal);
      border-radius: 12px;
      display: grid;
      place-items: center;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--texto-principal);
      margin: 0 0 0.2rem 0;
      letter-spacing: -0.02em;
    }

    .subtitulo {
      color: var(--texto-principal);
      opacity: 0.7;
      font-size: 0.95rem;
      margin: 0;
    }

    .seccion-tarjeta {
      background: #FFFFFF;
      border: 1px solid #e1e7ec;
      border-radius: 18px;
      padding: 2rem;
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.02);
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .seccion-tarjeta.highlight {
      background: linear-gradient(135deg, #f9fcfb 0%, #ffffff 100%);
      border-color: var(--turquesa-suave);
    }

    h2 {
      font-size: 1.35rem;
      font-weight: 700;
      color: var(--texto-principal);
      margin: 0;
    }

    h3 {
      font-size: 1.1rem;
      font-weight: 600;
      color: var(--texto-principal);
      margin: 0 0 0.75rem 0;
    }

    .grid-zonas {
      display: flex;
      flex-wrap: wrap;
      gap: 0.75rem;
    }

    .btn-zona {
      background: #f2f7f6;
      color: var(--texto-principal);
      border: 1.5px solid #d1dedb;
      padding: 0.65rem 1.25rem;
      border-radius: 12px;
      font-weight: 600;
      font-size: 0.9rem;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      transition: all 0.2s ease;
    }

    .btn-zona svg {
      color: #7b928e;
    }

    .btn-zona:hover {
      border-color: var(--turquesa-principal);
      background: var(--turquesa-suave);
      color: var(--turquesa-oscuro);
    }

    .btn-zona:hover svg {
      color: var(--turquesa-principal);
    }

    .btn-zona.activo {
      background: var(--turquesa-principal);
      border-color: var(--turquesa-principal);
      color: #ffffff;
      box-shadow: 0 4px 12px rgb(24 169 153 / 0.25);
    }

    .btn-zona.activo svg {
      color: #ffffff;
    }

    .grid-hogares {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 1.25rem;
    }

    .tarjeta-hogar {
      background: #FFFFFF;
      border: 1.5px solid #e1e7ec;
      border-radius: 16px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.02);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    .tarjeta-hogar:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgb(0 0 0 / 0.05);
      border-color: #b2e2db;
    }

    .hogar-info-top {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .hogar-badge {
      font-size: 0.75rem;
      font-weight: 700;
      color: #7b928e;
      background: #f2f7f6;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .estado-tag {
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.2rem 0.6rem;
      border-radius: 6px;
      text-transform: uppercase;
    }

    .estado-tag.activo {
      background: #E3F5F1;
      color: var(--turquesa-oscuro);
    }

    .estado-tag.inactivo {
      background: #FFF0ED;
      color: var(--coral);
    }

    .hogar-datos p {
      margin: 0.25rem 0;
      font-size: 0.9rem;
      color: var(--texto-principal);
    }

    .hogar-enlaces-rapidos {
      font-size: 0.85rem;
      display: flex;
      gap: 0.5rem;
      align-items: center;
    }

    .hogar-enlaces-rapidos a {
      color: var(--turquesa-principal);
      text-decoration: none;
      font-weight: 600;
    }

    .hogar-enlaces-rapidos a:hover {
      text-decoration: underline;
    }

    .hogar-enlaces-rapidos span {
      color: #cbd5e1;
    }

    .formulario-estilizado {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 14px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .formulario-edicion {
      border-top: 1px solid #edf2f7;
      padding-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .form-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    @media (max-width: 768px) {
      .form-row {
        grid-template-columns: 1fr;
      }
    }

    .form-row-inline {
      display: flex;
      gap: 1rem;
      align-items: flex-end;
    }

    .campo-grupo {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
      text-align: left;
    }

    .campo-grupo label {
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--texto-principal);
    }

    input, select {
      font: inherit;
      min-height: 42px;
      border-radius: 10px;
      border: 1.5px solid #cbd5e1;
      background: #FFFFFF;
      padding: 0 0.85rem;
      color: var(--texto-principal);
      transition: all 0.2s ease;
    }

    input:focus, select:focus {
      border-color: var(--turquesa-principal);
      box-shadow: 0 0 0 3px rgb(24 169 153 / 0.15);
      outline: none;
    }

    .btn-principal {
      background: var(--turquesa-principal);
      color: #ffffff;
      font-weight: 600;
      font-size: 0.9rem;
      min-height: 42px;
      border-radius: 10px;
      border: none;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 10px rgb(24 169 153 / 0.2);
    }

    .btn-principal:hover:not(:disabled) {
      background: var(--turquesa-oscuro);
      transform: translateY(-1px);
    }

    .btn-secundario {
      background: var(--turquesa-suave);
      color: var(--turquesa-oscuro);
      font-weight: 600;
      font-size: 0.85rem;
      min-height: 38px;
      border-radius: 8px;
      border: 1px solid #b2e2db;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-secundario:hover:not(:disabled) {
      background: var(--turquesa-principal);
      color: #ffffff;
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .zona-detalle-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .enlace-reporte {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: var(--turquesa-suave);
      color: var(--turquesa-oscuro);
      padding: 0.5rem 1rem;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 0.875rem;
      border: 1px solid #b2e2db;
      transition: all 0.2s ease;
    }

    .enlace-reporte:hover {
      background: var(--turquesa-principal);
      color: #ffffff;
    }

    .nota {
      font-size: 0.9rem;
      color: #64748b;
      margin: 0;
    }

    .nota.vacio {
      padding: 2rem;
      text-align: center;
      background: #f8fafc;
      border-radius: 12px;
      border: 1px dashed #cbd5e1;
      grid-column: 1 / -1;
    }

    .error {
      color: var(--coral);
      background: var(--coral-suave);
      padding: 0.75rem 1rem;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      margin: 0;
    }
  `]
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