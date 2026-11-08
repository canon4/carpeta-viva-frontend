import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { FORMATOS, pares } from './opciones';

type ReporteMadreDatos = components['schemas']['ReporteMadreOut'];
type ExportarRequest = components['schemas']['ExportarRequest'];
type InformeGenerado = components['schemas']['InformeGeneradoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Reporte por madre (ADR-0010 sección 2): la propia madre, coordinador de su zona, admin;
 * `auditor` solo agregados (`solo_agregado = true`, sin detalle individual).
 */
@Component({
  selector: 'app-reporte-madre',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Reporte de la madre sustituta</h1>
    <p><a routerLink="/reportes">Volver a Reportes</a></p>

    @if (cargando()) {
      <p class="nota">Cargando reporte...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (reporte()) {
      <section class="tarjeta">
        @if (reporte()!.solo_agregado) {
          <p class="nota">Vista agregada: sin lista individual de hogares o menores.</p>
        } @else {
          <p>Hogares: {{ reporte()!.hogares.join(', ') || 'Ninguno' }}</p>
          <p>Menores asignados: {{ reporte()!.menores_asignados.join(', ') || 'Ninguno' }}</p>
        }
        <h3>Documentos creados por ella, por estado</h3>
        <ul class="lista-simple">
          @for (par of paresDe(reporte()!.documentos_creados_por_ella_por_estado); track par[0]) {
            <li>{{ par[0] }}: {{ par[1] }}</li>
          }
        </ul>
        <p>Alertas activas: {{ reporte()!.alertas_activas }}</p>
        <p>Elementos de inventario: {{ reporte()!.inventario_items }}</p>
        <p>Alimentos vencidos: {{ reporte()!.alimentos_vencidos }}</p>

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
export class ReporteMadre {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  protected readonly madreId = inject(ActivatedRoute).snapshot.paramMap.get('madreId') ?? '';

  protected readonly formatos = FORMATOS;
  protected readonly paresDe = pares;
  protected formato = 'json';

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly reporte = signal<ReporteMadreDatos | null>(null);

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
        await firstValueFrom(this.http.get<ReporteMadreDatos>(`${this.config.apiUrl}/reportes/madre/${this.madreId}`)),
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
      const cuerpo: ExportarRequest = { nivel: 'madre', madre_id: this.madreId, formato: this.formato };
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
      if (error.status === 403) return 'No tiene acceso al reporte de esta madre.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
