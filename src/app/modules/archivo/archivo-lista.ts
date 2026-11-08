import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type ExpedienteArchivo = components['schemas']['ExpedienteArchivoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Listado de expedientes archivados (ADR-0010 sección 3.5): `coordinador` de su zona, `admin`.
 * `auditor` también lo ve, pero solo estos metadatos — nunca el botón de descarga del paquete
 * (eso está solo en la pantalla de un menor, y ahí se oculta para auditor).
 */
@Component({
  selector: 'app-archivo-lista',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Expedientes archivados</h1>

    <form class="formulario" (ngSubmit)="filtrar()">
      <label for="fZona">Id de la zona (opcional)</label>
      <input id="fZona" name="fZona" [(ngModel)]="filtroZonaId" />
      <label for="fDesde">Archivado desde (opcional)</label>
      <input id="fDesde" name="fDesde" type="date" [(ngModel)]="filtroDesde" />
      <label for="fHasta">Archivado hasta (opcional)</label>
      <input id="fHasta" name="fHasta" type="date" [(ngModel)]="filtroHasta" />
      <button type="submit" [disabled]="cargando()">Filtrar</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando expedientes archivados...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (e of expedientes(); track e.menor_id) {
        <li class="tarjeta">
          <p>Menor: {{ e.menor_id }}</p>
          <p>Zona: {{ e.zona_id || 'Sin registrar' }}</p>
          <p>Archivado el: {{ e.archivado_en }}</p>
          <p>Motivo: {{ e.motivo || 'Sin motivo registrado' }}</p>
          <p>Destino: {{ e.destino }}</p>
          <p><a [routerLink]="['/archivo/menores', e.menor_id]">Ver detalle de este expediente archivado</a></p>
        </li>
      }
      @if (!cargando() && expedientes().length === 0) {
        <p class="nota">No hay expedientes archivados con estos filtros.</p>
      }
    </ul>
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

  constructor() {
    void this.cargar();
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
