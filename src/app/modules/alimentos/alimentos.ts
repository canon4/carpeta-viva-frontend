import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Alimento = components['schemas']['AlimentoItemOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Control de Alimentos del hogar: ingreso de mercado, perecederos y vencimientos. */
@Component({
  selector: 'app-alimentos',
  imports: [FormsModule],
  template: `
    <h1>Control de Alimentos</h1>

    <form class="formulario" (ngSubmit)="cargar()">
      <label for="hogarId">Id del hogar</label>
      <input id="hogarId" name="hogarId" required [(ngModel)]="hogarId" />
      <label for="fPerecedero">Perecedero</label>
      <select id="fPerecedero" name="fPerecedero" [(ngModel)]="filtroPerecedero">
        <option value="">Todos</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
      <label for="fConsumido">Consumido</label>
      <select id="fConsumido" name="fConsumido" [(ngModel)]="filtroConsumido">
        <option value="">Todos</option>
        <option value="true">Sí</option>
        <option value="false">No</option>
      </select>
      <label for="fVencidos">
        <input id="fVencidos" name="fVencidos" type="checkbox" [(ngModel)]="filtroVencidos" />
        Solo vencidos
      </label>
      <button type="submit" [disabled]="!hogarId.trim() || cargando()">Cargar</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando alimentos...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (hogarCargado()) {
      <ul class="lista-simple">
        @for (a of alimentos(); track a.id) {
          <li class="tarjeta" [class.vencido]="esVencido(a)">
            <p><strong>{{ a.descripcion }}</strong> — {{ a.cantidad }} {{ a.unidad || '' }}</p>
            <p>Ingresó: {{ a.fecha_ingreso }}</p>
            <p>
              {{ a.perecedero ? 'Perecedero' : 'No perecedero' }}
              @if (a.perecedero) {
                — Vence: {{ a.fecha_vencimiento || 'Sin registrar' }}
              }
            </p>
            @if (esVencido(a)) {
              <p class="error" role="alert">Este alimento ya está vencido.</p>
            }
            <p>Estado: {{ a.consumido ? 'Consumido' : 'Disponible' }}</p>
            @if (!a.consumido) {
              <button type="button" (click)="marcarConsumido(a)" [disabled]="guardandoId() === a.id">
                {{ guardandoId() === a.id ? 'Guardando...' : 'Marcar como consumido' }}
              </button>
            }
          </li>
        }
        @if (!cargando() && alimentos().length === 0) {
          <p class="nota">No hay alimentos para mostrar con estos filtros.</p>
        }
      </ul>

      <form class="formulario tarjeta" (ngSubmit)="crear()" #f="ngForm">
        <h2>Registrar ingreso</h2>
        <label for="nDesc">Descripción</label>
        <input id="nDesc" name="nDesc" required [(ngModel)]="nuevo.descripcion" />
        <label for="nFechaIngreso">Fecha de ingreso</label>
        <input id="nFechaIngreso" name="nFechaIngreso" type="date" required [(ngModel)]="nuevo.fecha_ingreso" />
        <label for="nCantidad">Cantidad</label>
        <input id="nCantidad" name="nCantidad" type="number" min="0" step="0.1" required [(ngModel)]="nuevo.cantidad" />
        <label for="nUnidad">Unidad (opcional)</label>
        <input id="nUnidad" name="nUnidad" [(ngModel)]="nuevo.unidad" placeholder="kg, unidades, litros..." />
        <label for="nPerecedero">
          <input id="nPerecedero" name="nPerecedero" type="checkbox" [(ngModel)]="nuevo.perecedero" />
          Es perecedero
        </label>
        @if (nuevo.perecedero) {
          <label for="nVencimiento">Fecha de vencimiento</label>
          <input id="nVencimiento" name="nVencimiento" type="date" [(ngModel)]="nuevo.fecha_vencimiento" />
        }
        <button type="submit" [disabled]="f.invalid || guardando()">
          {{ guardando() ? 'Guardando...' : 'Registrar' }}
        </button>
      </form>
    }
  `,
  styles: [
    `
      .vencido {
        border-left: 4px solid #b00020;
        background-color: #fff3f3;
      }
    `,
  ],
})
export class Alimentos {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);

  protected hogarId = '';
  protected filtroPerecedero = '';
  protected filtroConsumido = '';
  protected filtroVencidos = false;

  protected readonly hogarCargado = signal(false);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly guardandoId = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly alimentos = signal<Alimento[]>([]);

  protected nuevo: {
    descripcion: string;
    fecha_ingreso: string;
    cantidad: number | null;
    unidad: string;
    perecedero: boolean;
    fecha_vencimiento: string;
  } = { descripcion: '', fecha_ingreso: '', cantidad: null, unidad: '', perecedero: false, fecha_vencimiento: '' };

  constructor() {
    this.hogarId = this.route.snapshot.queryParamMap.get('hogar_id') ?? '';
    if (this.hogarId) void this.cargar();
  }

  protected esVencido(a: Alimento): boolean {
    if (!a.perecedero || a.consumido || !a.fecha_vencimiento) return false;
    return new Date(a.fecha_vencimiento) < new Date(new Date().toDateString());
  }

  protected async cargar(): Promise<void> {
    if (!this.hogarId.trim()) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = { hogar_id: this.hogarId };
      if (this.filtroPerecedero) params['perecedero'] = this.filtroPerecedero;
      if (this.filtroConsumido) params['consumido'] = this.filtroConsumido;
      if (this.filtroVencidos) params['vencidos'] = 'true';
      this.alimentos.set(await firstValueFrom(this.http.get<Alimento[]>(`${this.config.apiUrl}/alimentos`, { params })));
      this.hogarCargado.set(true);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crear(): Promise<void> {
    if (this.nuevo.cantidad === null) return;
    this.guardando.set(true);
    this.error.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<Alimento>(`${this.config.apiUrl}/alimentos`, {
          hogar_id: this.hogarId,
          descripcion: this.nuevo.descripcion,
          fecha_ingreso: this.nuevo.fecha_ingreso,
          perecedero: this.nuevo.perecedero,
          fecha_vencimiento: this.nuevo.perecedero ? this.nuevo.fecha_vencimiento || null : null,
          cantidad: this.nuevo.cantidad,
          unidad: this.nuevo.unidad || null,
        }),
      );
      this.alimentos.set([creado, ...this.alimentos()]);
      this.nuevo = { descripcion: '', fecha_ingreso: '', cantidad: null, unidad: '', perecedero: false, fecha_vencimiento: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async marcarConsumido(a: Alimento): Promise<void> {
    this.guardandoId.set(a.id);
    this.error.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Alimento>(`${this.config.apiUrl}/alimentos/${a.id}/consumido`, {}),
      );
      this.alimentos.set(this.alimentos().map((x) => (x.id === actualizado.id ? actualizado : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para gestionar los alimentos de este hogar.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
