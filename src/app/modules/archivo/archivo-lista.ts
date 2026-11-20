import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { SelectorZona } from '../../shared/selector-zona/selector-zona';

type ExpedienteArchivo = components['schemas']['ExpedienteArchivoOut'];
type Menor = components['schemas']['MenorOut'];
type Zona = components['schemas']['ZonaOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Listado de expedientes archivados (ADR-0010 sección 3.5): `coordinador` de su zona, `admin`.
 * `auditor` también lo ve, pero solo estos metadatos — nunca el botón de descarga del paquete
 * (eso está solo en la pantalla de un menor, y ahí se oculta para auditor).
 */
@Component({
  selector: 'app-archivo-lista',
  imports: [FormsModule, RouterLink, SelectorZona],
  template: `
    <div class="encabezado-modulo">
      <h1>Expedientes archivados</h1>
    </div>

    <div class="filtros">
      <div class="campo">
        <app-selector-zona [valor]="filtroZonaId" (valorChange)="filtroZonaId = $event; filtrar()" />
      </div>
      <div class="campo">
        <label for="fDesde">Archivado desde</label>
        <input id="fDesde" type="date" [ngModel]="filtroDesde" (ngModelChange)="filtroDesde = $event; filtrar()" />
      </div>
      <div class="campo">
        <label for="fHasta">Archivado hasta</label>
        <input id="fHasta" type="date" [ngModel]="filtroHasta" (ngModelChange)="filtroHasta = $event; filtrar()" />
      </div>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="nota" role="status">Cargando expedientes archivados...</p>
    } @else if (expedientes().length === 0) {
      <p class="nota">No hay expedientes archivados con estos filtros.</p>
    } @else {
      <table class="tabla-datos" aria-label="Expedientes archivados">
        <thead>
          <tr>
            <th scope="col">Menor</th>
            <th scope="col">Zona</th>
            <th scope="col">Archivado</th>
            <th scope="col">Motivo</th>
            <th scope="col">Destino</th>
          </tr>
        </thead>
        <tbody>
          @for (e of expedientes(); track e.menor_id) {
            <tr>
              <td data-etiqueta="Menor"><a [routerLink]="['/archivo/menores', e.menor_id]">{{ nombreMenor(e.menor_id) }}</a></td>
              <td data-etiqueta="Zona">{{ nombreZona(e.zona_id) }}</td>
              <td data-etiqueta="Archivado">{{ e.archivado_en ? e.archivado_en.slice(0, 10) : '—' }}</td>
              <td data-etiqueta="Motivo">{{ e.motivo || 'Sin motivo' }}</td>
              <td data-etiqueta="Destino">{{ e.destino }}</td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class ArchivoLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly expedientes = signal<ExpedienteArchivo[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');

  protected filtroZonaId = '';
  protected filtroDesde = '';
  protected filtroHasta = '';

  private readonly nombresMenor = signal<Record<string, string>>({});
  private readonly nombresZona = signal<Record<string, string>>({});

  constructor() {
    void this.cargar();
    void this.cargarNombres();
  }

  protected nombreMenor(id: string): string {
    return this.nombresMenor()[id] ?? `Expediente ${id.slice(0, 8)}`;
  }

  protected nombreZona(id: string | null | undefined): string {
    if (!id) return 'Sin registrar';
    return this.nombresZona()[id] ?? `Zona ${id.slice(0, 8)}`;
  }

  /** Nombres legibles en lugar de ids. Si una consulta falla (rol sin acceso), queda el id corto. */
  private async cargarNombres(): Promise<void> {
    const [menores, zonas] = await Promise.allSettled([
      firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`)),
      firstValueFrom(this.http.get<Zona[]>(`${this.config.apiUrl}/zonas-hogares/zonas`)),
    ]);
    if (menores.status === 'fulfilled') {
      this.nombresMenor.set(Object.fromEntries(menores.value.map((m) => [m.id, `${m.nombres} ${m.apellidos}`])));
    }
    if (zonas.status === 'fulfilled') {
      this.nombresZona.set(Object.fromEntries(zonas.value.map((z) => [z.id, z.nombre])));
    }
  }

  protected filtrar(): void {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = {};
      if (this.filtroZonaId.trim()) params['zona_id'] = this.filtroZonaId.trim();
      if (this.filtroDesde) params['desde'] = this.filtroDesde;
      if (this.filtroHasta) params['hasta'] = this.filtroHasta;
      this.expedientes.set(
        await firstValueFrom(this.http.get<ExpedienteArchivo[]>(`${this.config.apiUrl}/archivo`, { params })),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para ver esta lista.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
