import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { FORMATOS, pares } from './opciones';

type ReporteAgregado = components['schemas']['ReporteAgregadoOut'];
type ExportarRequest = components['schemas']['ExportarRequest'];
type InformeGenerado = components['schemas']['InformeGeneradoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Reporte agregado de una zona (ADR-0010 sección 2): coordinador de esa zona, admin, auditor. */
@Component({
  selector: 'app-reporte-zona',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Reporte de zona</h1>
    <p><a routerLink="/reportes">Volver a Reportes</a></p>

    @if (cargando()) {
      <p class="nota">Cargando reporte...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (reporte()) {
      <section class="tarjeta">
        <h2>Zona {{ zonaId }}</h2>
        <h3>Menores por estado</h3>
        <ul class="lista-simple">
          @for (par of paresDe(reporte()!.menores_por_estado); track par[0]) {
            <li>{{ par[0] }}: {{ par[1] }}</li>
          }
        </ul>
        <p>
          Hogares: {{ reporte()!.hogares_total }} (capacidad total {{ reporte()!.hogares_capacidad_total }},
          con ocupación vigente {{ reporte()!.hogares_con_ocupacion_vigente }})
        </p>
        <p>Documentos pendientes de revisión: {{ reporte()!.documentos_pendientes_revision }}</p>
        <h3>Alertas activas por tipo</h3>
        <ul class="lista-simple">
          @for (par of paresDe(reporte()!.alertas_activas_por_tipo); track par[0]) {
            <li>{{ par[0] }}: {{ par[1] }}</li>
          }
        </ul>
        <p>Citas vencidas: {{ reporte()!.citas_vencidas }}</p>
        <p>Alimentos vencidos: {{ reporte()!.alimentos_vencidos }}</p>

        <form class="formulario" (ngSubmit)="exportar()">
          <label for="formato">Formato</label>
          <select id="formato" name="formato" [(ngModel)]="formato">
            @for (f of formatos; track f.valor) {
              <option [value]="f.valor">{{ f.etiqueta }}</option>
            }
          </select>
          <button type="submit" [disabled]="exportando()">
            {{ exportando() ? 'Exportando...' : 'Exportar este reporte' }}
          </button>
        </form>
        @if (mensajeExportado()) {
          <p class="exito" role="status">{{ mensajeExportado() }}</p>
        }
      </section>
    }
  `,
})
export class ReporteZona {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  protected readonly zonaId = inject(ActivatedRoute).snapshot.paramMap.get('zonaId') ?? '';

  protected readonly formatos = FORMATOS;
  protected readonly paresDe = pares;
  protected formato = 'json';

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly reporte = signal<ReporteAgregado | null>(null);

  protected readonly exportando = signal(false);
  protected readonly mensajeExportado = signal('');

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.reporte.set(
        await firstValueFrom(this.http.get<ReporteAgregado>(`${this.config.apiUrl}/reportes/zona/${this.zonaId}`)),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async exportar(): Promise<void> {
    this.exportando.set(true);
    this.mensajeExportado.set('');
    this.error.set('');
    try {
      const cuerpo: ExportarRequest = { nivel: 'zona', zona_id: this.zonaId, formato: this.formato };
      await firstValueFrom(this.http.post<InformeGenerado>(`${this.config.apiUrl}/reportes/exportar`, cuerpo));
      this.mensajeExportado.set('Exportación generada. Puede descargarla desde Informes exportados.');
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.exportando.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para ver o exportar el reporte de esta zona.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
