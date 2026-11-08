import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { FORMATOS, pares } from './opciones';

type ReporteAgregado = components['schemas']['ReporteAgregadoOut'];
type ReporteMadre = components['schemas']['ReporteMadreOut'];
type ExportarRequest = components['schemas']['ExportarRequest'];
type InformeGenerado = components['schemas']['InformeGeneradoOut'];
type Madre = components['schemas']['MadreOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Entrada al módulo de Reportes. Cada rol ve un nivel distinto en la misma pantalla (ADR-0010
 * sección 2, sin módulo aparte): admin/auditor ven el general de todas las zonas; coordinador
 * recibe automáticamente el agregado de su propia zona (el backend lo acota, no hace falta
 * pedirlo); la madre ve su propio reporte; profesional/defensor solo llegan al nivel "menor"
 * desde el expediente de cada NNA a su cargo.
 */
@Component({
  selector: 'app-reportes-panel',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Reportes</h1>
    <p>
      <a routerLink="/reportes/exportados">Ver informes exportados</a>
    </p>

    @if (cargando()) {
      <p class="nota">Cargando reporte...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (puedeGeneral()) {
      <section class="tarjeta">
        <h2>Reporte general{{ auth.rol() === 'coordinador' ? ' de mi zona' : '' }}</h2>
        @if (!general()) {
          <button type="button" (click)="cargarGeneral()" [disabled]="cargando()">Ver reporte general</button>
        } @else {
          <p>Zona: {{ general()!.zona_id || 'Todas' }}</p>
          <h3>Menores por estado</h3>
          <ul class="lista-simple">
            @for (par of paresDe(general()!.menores_por_estado); track par[0]) {
              <li>{{ par[0] }}: {{ par[1] }}</li>
            }
          </ul>
          <p>
            Hogares: {{ general()!.hogares_total }} (capacidad total {{ general()!.hogares_capacidad_total }},
            con ocupación vigente {{ general()!.hogares_con_ocupacion_vigente }})
          </p>
          <p>Documentos pendientes de revisión: {{ general()!.documentos_pendientes_revision }}</p>
          <h3>Alertas activas por tipo</h3>
          <ul class="lista-simple">
            @for (par of paresDe(general()!.alertas_activas_por_tipo); track par[0]) {
              <li>{{ par[0] }}: {{ par[1] }}</li>
            }
          </ul>
          <p>Citas vencidas: {{ general()!.citas_vencidas }}</p>
          <p>Alimentos vencidos: {{ general()!.alimentos_vencidos }}</p>

          @if (puedeExportar()) {
            <form class="formulario" (ngSubmit)="exportar('general', {})">
              <label for="formatoGeneral">Formato</label>
              <select id="formatoGeneral" name="formatoGeneral" [(ngModel)]="formato">
                @for (f of formatos; track f.valor) {
                  <option [value]="f.valor">{{ f.etiqueta }}</option>
                }
              </select>
              <button type="submit" [disabled]="exportando()">
                {{ exportando() ? 'Exportando...' : 'Exportar este reporte' }}
              </button>
            </form>
          }
        }
      </section>
    }

    @if (esMadre()) {
      <section class="tarjeta">
        <h2>Mi reporte</h2>
        @if (reporteMadre()) {
          <p>Hogares: {{ reporteMadre()!.hogares.length }}</p>
          <p>Menores asignados: {{ reporteMadre()!.menores_asignados.length }}</p>
          <p>Alertas activas: {{ reporteMadre()!.alertas_activas }}</p>
          <p>Elementos de inventario: {{ reporteMadre()!.inventario_items }}</p>
          <p>Alimentos vencidos: {{ reporteMadre()!.alimentos_vencidos }}</p>
          <h3>Documentos creados por usted, por estado</h3>
          <ul class="lista-simple">
            @for (par of paresDe(reporteMadre()!.documentos_creados_por_ella_por_estado); track par[0]) {
              <li>{{ par[0] }}: {{ par[1] }}</li>
            }
          </ul>
        }
      </section>
    }

    @if (esCoordinadorOAdmin()) {
      <section class="tarjeta">
        <h2>Reporte de una zona específica</h2>
        <form class="formulario" (ngSubmit)="irAZona()">
          <label for="zonaId">Id de la zona</label>
          <input id="zonaId" name="zonaId" required [(ngModel)]="zonaIdConsulta" />
          <button type="submit">Ver reporte de esa zona</button>
        </form>
      </section>
    }

    @if (!puedeGeneral() && !esMadre()) {
      <p class="nota">
        Su rol ve los reportes desde el expediente de cada menor a su cargo. Abra el expediente del
        menor y use "Ver reporte de este menor".
      </p>
    }

    @if (mensajeExportado()) {
      <p class="exito" role="status">{{ mensajeExportado() }}</p>
    }
  `,
})
export class ReportesPanel {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly formatos = FORMATOS;
  protected readonly paresDe = pares;

  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly general = signal<ReporteAgregado | null>(null);
  protected readonly reporteMadre = signal<ReporteMadre | null>(null);

  protected readonly exportando = signal(false);
  protected readonly mensajeExportado = signal('');
  protected formato = 'json';
  protected zonaIdConsulta = '';

  protected readonly esMadre = computed(() => this.auth.rol() === 'madre');
  protected readonly esCoordinadorOAdmin = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'auditor';
  });
  protected readonly puedeGeneral = computed(() => {
    const rol = this.auth.rol();
    return rol === 'admin' || rol === 'auditor' || rol === 'coordinador';
  });
  protected readonly puedeExportar = computed(() => this.auth.rol() !== 'auditor');

  constructor() {
    if (this.esMadre()) void this.cargarReporteMadre();
  }

  protected async cargarGeneral(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.general.set(await firstValueFrom(this.http.get<ReporteAgregado>(`${this.config.apiUrl}/reportes/general`)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarReporteMadre(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const madre = await firstValueFrom(this.http.get<Madre>(`${this.config.apiUrl}/madres/yo`));
      this.reporteMadre.set(
        await firstValueFrom(this.http.get<ReporteMadre>(`${this.config.apiUrl}/reportes/madre/${madre.id}`)),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected irAZona(): void {
    if (!this.zonaIdConsulta.trim()) return;
    void this.router.navigate(['/reportes/zona', this.zonaIdConsulta.trim()]);
  }

  protected async exportar(nivel: string, filtrosExtra: Record<string, string | null>): Promise<void> {
    this.exportando.set(true);
    this.mensajeExportado.set('');
    this.error.set('');
    try {
      const cuerpo: ExportarRequest = { nivel, formato: this.formato, ...filtrosExtra };
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
      if (error.status === 403) return 'Su rol no tiene permiso para ver o exportar este reporte.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
