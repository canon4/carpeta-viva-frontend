import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { FORMATOS, pares } from './opciones';

type ReporteMenorDatos = components['schemas']['ReporteMenorOut'];
type ExportarRequest = components['schemas']['ExportarRequest'];
type InformeGenerado = components['schemas']['InformeGeneradoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Reporte de un menor (ADR-0010 sección 2): misma regla que leer el expediente
 * (`puede_ver_menor`); las secciones sensibles sin `tiene_permiso_seccion` se omiten y aparecen
 * en `secciones_sin_acceso`, nunca como error.
 */
@Component({
  selector: 'app-reporte-menor',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Reporte de este menor</h1>
    <p>
      <a [routerLink]="['/menores', menorId]">Volver al expediente</a>
      · <a routerLink="/reportes">Ver Reportes</a>
    </p>

    @if (cargando()) {
      <p class="nota">Cargando reporte...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (reporte()) {
      <section class="tarjeta">
        <p>Estado actual: {{ reporte()!.estado_actual }}</p>
        <p>Hogar con asignación vigente: {{ reporte()!.asignacion_vigente_hogar_id || 'Sin asignación vigente' }}</p>

        <h3>Documentos por categoría</h3>
        <ul class="lista-simple">
          @for (par of paresDe(reporte()!.documentos_por_categoria); track par[0]) {
            <li>{{ par[0] }}: {{ par[1] }}</li>
          }
        </ul>

        <h3>Documentos visibles</h3>
        <ul class="lista-simple">
          @for (d of reporte()!.documentos_visibles; track d.id) {
            <li><a [routerLink]="['/documentos', d.id]">{{ d.titulo }}</a> — {{ d.categoria }} — {{ d.estado_flujo }}</li>
          }
          @if (reporte()!.documentos_visibles.length === 0) {
            <p class="nota">No hay documentos visibles.</p>
          }
        </ul>

        <h3>Informes por tipo</h3>
        <ul class="lista-simple">
          @for (par of paresDe(reporte()!.reportes_por_tipo); track par[0]) {
            <li>{{ par[0] }}: {{ par[1] }}</li>
          }
        </ul>

        <p>Alertas activas: {{ reporte()!.alertas_activas }}</p>
        <p>Citas próximas: {{ reporte()!.citas_proximas }}</p>

        @if (reporte()!.secciones_sin_acceso && reporte()!.secciones_sin_acceso!.length > 0) {
          <p class="nota">
            No tiene permiso para ver el detalle de: {{ reporte()!.secciones_sin_acceso!.join(', ') }}. Esas
            secciones se omitieron de este reporte.
          </p>
        }

        @if (puedeExportar()) {
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
        }
        @if (mensajeExportado()) {
          <p class="exito" role="status">{{ mensajeExportado() }}</p>
        }
      </section>
    }
  `,
})
export class ReporteMenor {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  protected readonly menorId = inject(ActivatedRoute).snapshot.paramMap.get('menorId') ?? '';

  protected readonly formatos = FORMATOS;
  protected readonly paresDe = pares;
  protected formato = 'json';

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly reporte = signal<ReporteMenorDatos | null>(null);

  protected readonly exportando = signal(false);
  protected readonly mensajeExportado = signal('');

  protected puedeExportar(): boolean {
    return this.auth.rol() !== 'auditor';
  }

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.reporte.set(
        await firstValueFrom(this.http.get<ReporteMenorDatos>(`${this.config.apiUrl}/reportes/menor/${this.menorId}`)),
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
      const cuerpo: ExportarRequest = { nivel: 'menor', menor_id: this.menorId, formato: this.formato };
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
      if (error.status === 403) return 'No tiene acceso al expediente de este menor.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
