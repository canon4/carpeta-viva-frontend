import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Asignacion = components['schemas']['AsignacionOut'];
type AsignacionHistoria = components['schemas']['AsignacionHistoryOut'];
type TipoMovimiento = components['schemas']['TipoMovimiento'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Asignaciones y traslados: vincula un menor con un hogar (ingreso o traslado) y permite
 * cerrar (egreso) una asignación. Cerrar oculta el expediente a la madre (RF7): se exige
 * confirmación explícita, no un botón suelto.
 */
@Component({
  selector: 'app-asignaciones',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Asignaciones y Traslados</h1>
    <p><a routerLink="/menores">Ir a Menores y Expedientes</a></p>

    <form class="formulario" (ngSubmit)="filtrar()">
      <label for="fMenor">Id del menor (opcional)</label>
      <input id="fMenor" name="fMenor" [(ngModel)]="filtroMenorId" />
      <label for="fHogar">Id del hogar (opcional)</label>
      <input id="fHogar" name="fHogar" [(ngModel)]="filtroHogarId" />
      <label for="fZona">Id de la zona (opcional)</label>
      <input id="fZona" name="fZona" [(ngModel)]="filtroZonaId" />
      <button type="submit" [disabled]="cargando()">Filtrar</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando asignaciones...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (a of asignaciones(); track a.id) {
        <li class="tarjeta">
          <p>Menor: {{ a.menor_id }}</p>
          <p>Hogar: {{ a.hogar_id }}</p>
          <p>Tipo de movimiento: {{ a.tipo_movimiento }}</p>
          <p>Desde: {{ a.fecha_inicio }} — Hasta: {{ a.fecha_fin || 'Vigente' }}</p>
          <p>Estado: {{ a.estado }}</p>
          <button type="button" (click)="verHistorial(a)">Ver historial</button>

          @if (a.estado === 'vigente' || !a.fecha_fin) {
            @if (cerrandoId() === a.id) {
              <div class="tarjeta">
                <p class="error" role="alert">
                  Al cerrar esta asignación el expediente del menor deja de ser visible para la madre
                  del hogar (el expediente nunca se borra, solo se oculta). Confirme que el menor
                  realmente salió de este hogar.
                </p>
                <form class="formulario" (ngSubmit)="confirmarCierre(a)">
                  <label [for]="'fechaFin-' + a.id">Fecha de salida</label>
                  <input [id]="'fechaFin-' + a.id" name="fechaFin" type="date" required [(ngModel)]="cierre.fecha_fin" />
                  <label [for]="'motivoCierre-' + a.id">Motivo</label>
                  <input [id]="'motivoCierre-' + a.id" name="motivoCierre" [(ngModel)]="cierre.motivo" />
                  <label [for]="'actaCierre-' + a.id">Referencia del acta (opcional)</label>
                  <input [id]="'actaCierre-' + a.id" name="actaCierre" [(ngModel)]="cierre.acta_referencia" />
                  <button type="submit" [disabled]="guardandoCierre()">
                    {{ guardandoCierre() ? 'Cerrando...' : 'Confirmar cierre y ocultar expediente a la madre' }}
                  </button>
                  <button type="button" (click)="cancelarCierre()">Cancelar</button>
                </form>
              </div>
            } @else {
              <button type="button" (click)="iniciarCierre(a)">Cerrar asignación (egreso o traslado)</button>
            }
          }

          @if (historialSeleccionadoId() === a.id) {
            <table class="tabla">
              <thead>
                <tr>
                  <th>Versión</th>
                  <th>Hogar</th>
                  <th>Fecha fin</th>
                  <th>Motivo</th>
                  <th>Fecha del cambio</th>
                </tr>
              </thead>
              <tbody>
                @for (h of historial(); track h.id) {
                  <tr>
                    <td>{{ h.version }}</td>
                    <td>{{ h.hogar_id }}</td>
                    <td>{{ h.fecha_fin || 'Sin cerrar' }}</td>
                    <td>{{ h.motivo || 'Sin motivo registrado' }}</td>
                    <td>{{ h.created_at }}</td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </li>
      }
      @if (!cargando() && asignaciones().length === 0) {
        <p class="nota">No hay asignaciones para mostrar con estos filtros.</p>
      }
    </ul>

    <form class="formulario tarjeta" (ngSubmit)="crear()" #f="ngForm">
      <h2>Registrar ingreso o traslado</h2>
      <label for="nMenor">Id del menor</label>
      <input id="nMenor" name="nMenor" required [(ngModel)]="nueva.menor_id" />
      <label for="nHogar">Id del hogar</label>
      <input id="nHogar" name="nHogar" required [(ngModel)]="nueva.hogar_id" />
      <label for="nFechaInicio">Fecha de inicio</label>
      <input id="nFechaInicio" name="nFechaInicio" type="date" required [(ngModel)]="nueva.fecha_inicio" />
      <label for="nTipo">Tipo de movimiento</label>
      <select id="nTipo" name="nTipo" required [(ngModel)]="nueva.tipo_movimiento">
        <option value="ingreso">Ingreso</option>
        <option value="traslado">Traslado (cierra la asignación vigente anterior)</option>
      </select>
      <label for="nActa">Referencia del acta (opcional)</label>
      <input id="nActa" name="nActa" [(ngModel)]="nueva.acta_referencia" />
      <label for="nMotivo">Motivo (opcional)</label>
      <input id="nMotivo" name="nMotivo" [(ngModel)]="nueva.motivo" />
      <button type="submit" [disabled]="f.invalid || guardando()">
        {{ guardando() ? 'Guardando...' : 'Registrar' }}
      </button>
    </form>
  `,
})
export class Asignaciones {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);

  protected readonly asignaciones = signal<Asignacion[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);

  protected filtroMenorId = '';
  protected filtroHogarId = '';
  protected filtroZonaId = '';

  protected readonly cerrandoId = signal<string | null>(null);
  protected readonly guardandoCierre = signal(false);
  protected cierre = { fecha_fin: '', motivo: '', acta_referencia: '' };

  protected readonly historialSeleccionadoId = signal<string | null>(null);
  protected readonly historial = signal<AsignacionHistoria[]>([]);

  protected nueva: {
    menor_id: string;
    hogar_id: string;
    fecha_inicio: string;
    tipo_movimiento: TipoMovimiento;
    acta_referencia: string;
    motivo: string;
  } = { menor_id: '', hogar_id: '', fecha_inicio: '', tipo_movimiento: 'ingreso', acta_referencia: '', motivo: '' };

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
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
      if (this.filtroMenorId.trim()) params['menor_id'] = this.filtroMenorId.trim();
      if (this.filtroHogarId.trim()) params['hogar_id'] = this.filtroHogarId.trim();
      if (this.filtroZonaId.trim()) params['zona_id'] = this.filtroZonaId.trim();
      this.asignaciones.set(
        await firstValueFrom(this.http.get<Asignacion[]>(`${this.config.apiUrl}/asignaciones`, { params })),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crear(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const creada = await firstValueFrom(
        this.http.post<Asignacion>(`${this.config.apiUrl}/asignaciones`, {
          menor_id: this.nueva.menor_id,
          hogar_id: this.nueva.hogar_id,
          fecha_inicio: this.nueva.fecha_inicio,
          tipo_movimiento: this.nueva.tipo_movimiento,
          acta_referencia: this.nueva.acta_referencia || null,
          motivo: this.nueva.motivo || null,
        }),
      );
      this.asignaciones.set([...this.asignaciones(), creada]);
      this.nueva = { menor_id: '', hogar_id: '', fecha_inicio: '', tipo_movimiento: 'ingreso', acta_referencia: '', motivo: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected iniciarCierre(a: Asignacion): void {
    this.cerrandoId.set(a.id);
    this.cierre = { fecha_fin: '', motivo: '', acta_referencia: '' };
  }

  protected cancelarCierre(): void {
    this.cerrandoId.set(null);
  }

  protected async confirmarCierre(a: Asignacion): Promise<void> {
    this.guardandoCierre.set(true);
    this.error.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Asignacion>(`${this.config.apiUrl}/asignaciones/${a.id}/cerrar`, {
          fecha_fin: this.cierre.fecha_fin || null,
          motivo: this.cierre.motivo || null,
          acta_referencia: this.cierre.acta_referencia || null,
        }),
      );
      this.asignaciones.set(this.asignaciones().map((x) => (x.id === actualizada.id ? actualizada : x)));
      this.cerrandoId.set(null);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoCierre.set(false);
    }
  }

  protected async verHistorial(a: Asignacion): Promise<void> {
    if (this.historialSeleccionadoId() === a.id) {
      this.historialSeleccionadoId.set(null);
      return;
    }
    this.historialSeleccionadoId.set(a.id);
    try {
      this.historial.set(
        await firstValueFrom(
          this.http.get<AsignacionHistoria[]>(`${this.config.apiUrl}/asignaciones/${a.id}/historial`),
        ),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para realizar esta acción.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
