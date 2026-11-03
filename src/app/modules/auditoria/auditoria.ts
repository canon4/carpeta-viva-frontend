import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Acceso = components['schemas']['AuditoriaAccesoOut'];

const TAMANO_PAGINA = 50;
const MENSAJE_GENERICO = 'No se pudo cargar el registro de auditoría. Intente de nuevo.';

/** Registro de accesos, solo lectura, con filtros y paginación. Roles auditor/admin. */
@Component({
  selector: 'app-auditoria',
  imports: [FormsModule, DatePipe],
  template: `
    <h1>Auditoría</h1>
    <p class="nota">Registro de todo acceso al sistema. Esta pantalla es de solo lectura.</p>

    <form class="formulario" (ngSubmit)="buscar()">
      <label for="usuarioId">Id de usuario</label>
      <input id="usuarioId" name="usuarioId" [(ngModel)]="filtroUsuarioId" placeholder="Opcional" />
      <label for="accion">Acción</label>
      <input id="accion" name="accion" [(ngModel)]="filtroAccion" placeholder="Ejemplo: login, crear_documento" />
      <label for="desde">Desde</label>
      <input id="desde" name="desde" type="date" [(ngModel)]="filtroDesde" />
      <label for="hasta">Hasta</label>
      <input id="hasta" name="hasta" type="date" [(ngModel)]="filtroHasta" />
      <button type="submit" [disabled]="cargando()">Buscar</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando registros...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (!cargando() && accesos().length === 0) {
      <p class="nota">No hay registros para los filtros indicados.</p>
    }

    @if (accesos().length > 0) {
      <div class="tarjeta" style="overflow-x:auto">
        <table class="tabla">
          <thead>
            <tr>
              <th scope="col">Fecha</th>
              <th scope="col">Usuario</th>
              <th scope="col">Acción</th>
              <th scope="col">Recurso</th>
              <th scope="col">Menor</th>
              <th scope="col">IP</th>
            </tr>
          </thead>
          <tbody>
            @for (a of accesos(); track a.id) {
              <tr>
                <td>{{ a.created_at | date: 'short' }}</td>
                <td>{{ a.usuario_id || 'Sin dato' }}</td>
                <td>{{ a.accion }}</td>
                <td>{{ a.recurso || '—' }}</td>
                <td>{{ a.menor_id || '—' }}</td>
                <td>{{ a.ip || '—' }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>

      <div class="formulario" style="grid-auto-flow: column; justify-content: start">
        <button type="button" (click)="anterior()" [disabled]="pagina() === 0 || cargando()">Anterior</button>
        <button type="button" (click)="siguiente()" [disabled]="accesos().length < TAMANO_PAGINA || cargando()">Siguiente</button>
      </div>
    }
  `,
})
export class Auditoria {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly TAMANO_PAGINA = TAMANO_PAGINA;
  protected readonly accesos = signal<Acceso[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly pagina = signal(0);

  protected filtroUsuarioId = '';
  protected filtroAccion = '';
  protected filtroDesde = '';
  protected filtroHasta = '';

  constructor() {
    void this.cargar();
  }

  protected buscar(): void {
    this.pagina.set(0);
    void this.cargar();
  }

  protected anterior(): void {
    if (this.pagina() === 0) return;
    this.pagina.set(this.pagina() - 1);
    void this.cargar();
  }

  protected siguiente(): void {
    this.pagina.set(this.pagina() + 1);
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string | number> = {
        limit: TAMANO_PAGINA,
        offset: this.pagina() * TAMANO_PAGINA,
      };
      if (this.filtroUsuarioId.trim()) params['usuario_id'] = this.filtroUsuarioId.trim();
      if (this.filtroAccion.trim()) params['accion'] = this.filtroAccion.trim();
      if (this.filtroDesde) params['desde'] = this.filtroDesde;
      if (this.filtroHasta) params['hasta'] = this.filtroHasta;

      this.accesos.set(
        await firstValueFrom(this.http.get<Acceso[]>(`${this.config.apiUrl}/auditoria`, { params })),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }
}
