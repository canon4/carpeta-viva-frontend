import { HttpClient } from '@angular/common/http';
import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Hogar = components['schemas']['HogarOut'];
type Zona = components['schemas']['ZonaOut'];
type Madre = components['schemas']['MadreOut'];
type ZonaPanelGroup = components['schemas']['ZonaPanelGroup'];

interface OpcionHogar {
  id: string;
  etiqueta: string;
}

let contador = 0;

/**
 * Reemplaza "Id del hogar" escrito a mano. Se adapta al rol porque el acceso a los datos es
 * distinto para cada uno:
 * - madre: no tiene acceso a Zonas y Hogares (roles coordinador/admin), así que se resuelve sola
 *   con el hogar de GET /madres/yo (ver ADR, `hogar_id` agregado ahí) — no hay nada que elegir.
 * - coordinador/admin: lista desplegable con la zona de cada hogar (GET /zonas-hogares/*).
 * - profesional/defensor: tampoco tienen acceso a Zonas y Hogares, pero sí a sus propios menores
 *   asignados (GET /menores/panel/profesional); se arma la lista agrupando esos hogares y
 *   mostrando los nombres de los menores que viven en cada uno (lo que de verdad reconocen).
 * - auditor: de momento sigue escribiendo el id a mano (no tiene ningún listado propio de
 *   hogares ni de menores; pendiente de una mejora futura).
 */
@Component({
  selector: 'app-selector-hogar',
  imports: [FormsModule],
  template: `
    @if (rol() === 'madre') {
      @if (cargando()) {
        <p class="nota">Cargando su hogar...</p>
      } @else if (!valor) {
        <p class="error" role="alert">No tiene un hogar asignado todavía.</p>
      }
    } @else if (rol() === 'coordinador' || rol() === 'admin' || rol() === 'profesional' || rol() === 'defensor') {
      <label [for]="campoId">{{ etiqueta }}</label>
      <select
        [id]="campoId"
        [name]="campoId"
        [ngModel]="valor"
        (ngModelChange)="cambiar($event)"
        [required]="requerido"
        [disabled]="cargando()"
      >
        <option value="">{{ cargando() ? 'Cargando...' : opcionVacia }}</option>
        @for (o of opciones(); track o.id) {
          <option [value]="o.id">{{ o.etiqueta }}</option>
        }
      </select>
      @if (!cargando() && opciones().length === 0) {
        <p class="nota">No tiene hogares disponibles para elegir.</p>
      }
    } @else {
      <label [for]="campoId">{{ etiqueta }} (id)</label>
      <input [id]="campoId" [name]="campoId" [ngModel]="valor" (ngModelChange)="cambiar($event)" [required]="requerido" />
      <p class="nota">Pídaselo al coordinador de su zona si no lo tiene a la mano.</p>
    }
  `,
})
export class SelectorHogar {
  @Input() valor = '';
  @Input() requerido = false;
  @Input() etiqueta = 'Hogar';
  @Input() opcionVacia = 'Seleccione un hogar';
  @Output() readonly valorChange = new EventEmitter<string>();

  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  protected readonly rol = this.auth.rol;
  protected readonly campoId = `selectorHogar${++contador}`;
  protected readonly cargando = signal(false);
  protected readonly opciones = signal<OpcionHogar[]>([]);

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const rol = this.rol();
    this.cargando.set(true);
    try {
      if (rol === 'madre') {
        const madre = await firstValueFrom(this.http.get<Madre>(`${this.config.apiUrl}/madres/yo`));
        this.cambiar(madre.hogar_id ?? '');
      } else if (rol === 'coordinador' || rol === 'admin') {
        const [zonas, hogares] = await Promise.all([
          firstValueFrom(this.http.get<Zona[]>(`${this.config.apiUrl}/zonas-hogares/zonas`)),
          firstValueFrom(this.http.get<Hogar[]>(`${this.config.apiUrl}/zonas-hogares/hogares`)),
        ]);
        const zonasPorId = new Map(zonas.map((z) => [z.id, z.nombre]));
        this.opciones.set(
          hogares.map((h) => ({
            id: h.id,
            etiqueta: zonasPorId.has(h.zona_id) ? `Hogar de la zona ${zonasPorId.get(h.zona_id)}` : `Hogar ${h.id.slice(0, 8)}`,
          })),
        );
      } else if (rol === 'profesional' || rol === 'defensor') {
        const grupos = await firstValueFrom(
          this.http.get<ZonaPanelGroup[]>(`${this.config.apiUrl}/menores/panel/profesional`),
        );
        const opciones: OpcionHogar[] = [];
        for (const zona of grupos) {
          for (const h of zona.hogares) {
            const nombres = h.menores.map((m) => m.nombres).join(', ');
            opciones.push({ id: h.hogar_id, etiqueta: `Hogar de ${nombres}` });
          }
        }
        this.opciones.set(opciones);
      }
    } catch {
      // Sin datos para elegir; el rol madre queda sin hogar asignado, los demás sin opciones.
    } finally {
      this.cargando.set(false);
    }
  }

  protected cambiar(valor: string): void {
    this.valor = valor;
    this.valorChange.emit(valor);
  }
}
