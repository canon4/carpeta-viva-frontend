import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import { SelectorHogar } from '../../shared/selector-hogar/selector-hogar';
import type { components } from '../../core/api/schema';

type Alimento = components['schemas']['AlimentoItemOut'];
type ChecklistItem = components['schemas']['AlimentoChecklistItemOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Control de Alimentos del hogar: ingreso de mercado, perecederos y vencimientos. */
@Component({
  selector: 'app-alimentos',
  imports: [FormsModule, SelectorHogar],
  template: `
    <h1>Control de Alimentos</h1>

    <form class="formulario" (ngSubmit)="cargar()">
      <app-selector-hogar [(valor)]="hogarId" [requerido]="true" />
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
            @if (a.checklist_item_id) {
              <p class="nota">Viene de un producto habitual del checklist.</p>
            }
            @if (!a.consumido && esMadreOAdmin()) {
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

      <section class="tarjeta">
        <h2>Productos habituales</h2>
        <p class="nota">
          Registre aquí los productos de mercado que compra seguido. Al volver a comprar uno,
          solo tendrá que indicar fecha de ingreso, vencimiento y cantidad.
        </p>

        @if (errorChecklist()) {
          <p class="error" role="alert">{{ errorChecklist() }}</p>
        }
        @if (cargandoChecklist()) {
          <p class="nota">Cargando productos habituales...</p>
        }

        <ul class="lista-simple">
          @for (p of checklist(); track p.id) {
            <li class="tarjeta">
              <p>
                <strong>{{ p.descripcion }}</strong> —
                {{ p.perecedero ? 'Perecedero' : 'No perecedero' }}
                @if (p.unidad_por_defecto) {
                  ({{ p.unidad_por_defecto }})
                }
              </p>

              @if (esMadreOAdmin()) {
                @if (!mostrarComprar[p.id]) {
                  <button type="button" (click)="abrirComprar(p)">Comprar de nuevo</button>
                } @else {
                  <form class="formulario" (ngSubmit)="comprarDeChecklist(p)" #fcp="ngForm">
                    <label [for]="'fechaIngresoChk-' + p.id">Fecha de ingreso</label>
                    <input
                      [id]="'fechaIngresoChk-' + p.id"
                      [name]="'fechaIngresoChk-' + p.id"
                      type="date"
                      required
                      [(ngModel)]="compraChecklist[p.id].fecha_ingreso"
                    />
                    @if (p.perecedero) {
                      <label [for]="'fechaVenceChk-' + p.id">Fecha de vencimiento</label>
                      <input
                        [id]="'fechaVenceChk-' + p.id"
                        [name]="'fechaVenceChk-' + p.id"
                        type="date"
                        [(ngModel)]="compraChecklist[p.id].fecha_vencimiento"
                      />
                    }
                    <label [for]="'cantidadChk-' + p.id">Cantidad</label>
                    <input
                      [id]="'cantidadChk-' + p.id"
                      [name]="'cantidadChk-' + p.id"
                      type="number"
                      min="0"
                      step="0.1"
                      required
                      [(ngModel)]="compraChecklist[p.id].cantidad"
                    />
                    <button type="submit" [disabled]="fcp.invalid || comprandoId() === p.id">
                      {{ comprandoId() === p.id ? 'Registrando...' : 'Confirmar compra' }}
                    </button>
                    <button type="button" (click)="mostrarComprar[p.id] = false">Cancelar</button>
                  </form>
                }

                <button type="button" (click)="desactivarChecklist(p)" [disabled]="guardandoChecklistId() === p.id">
                  Ya no compro este producto
                </button>
              }
            </li>
          }
          @if (!cargandoChecklist() && checklist().length === 0) {
            <p class="nota">Este hogar no tiene productos habituales registrados.</p>
          }
        </ul>

        @if (esMadreOAdmin()) {
          <form class="formulario" (ngSubmit)="crearChecklist()" #fc="ngForm">
            <h3>Registrar producto habitual</h3>
            <label for="nDescChk">Descripción</label>
            <input id="nDescChk" name="nDescChk" required [(ngModel)]="nuevoChecklist.descripcion" />
            <label for="nUnidadChk">Unidad por defecto (opcional)</label>
            <input id="nUnidadChk" name="nUnidadChk" [(ngModel)]="nuevoChecklist.unidad_por_defecto" placeholder="kg, unidades, litros..." />
            <label for="nPerecederoChk">
              <input id="nPerecederoChk" name="nPerecederoChk" type="checkbox" [(ngModel)]="nuevoChecklist.perecedero" />
              Es perecedero
            </label>
            <button type="submit" [disabled]="fc.invalid || creandoChecklist()">
              {{ creandoChecklist() ? 'Guardando...' : 'Registrar producto' }}
            </button>
          </form>
        }
      </section>

      @if (esMadreOAdmin()) {
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
  private readonly auth = inject(AuthService);

  protected readonly esMadreOAdmin = computed(() => this.auth.rol() === 'madre' || this.auth.rol() === 'admin');

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

  protected readonly checklist = signal<ChecklistItem[]>([]);
  protected readonly cargandoChecklist = signal(false);
  protected readonly errorChecklist = signal('');
  protected readonly creandoChecklist = signal(false);
  protected readonly guardandoChecklistId = signal<string | null>(null);
  protected readonly comprandoId = signal<string | null>(null);

  protected readonly mostrarComprar: Record<string, boolean> = {};
  protected readonly compraChecklist: Record<
    string,
    { fecha_ingreso: string; fecha_vencimiento: string; cantidad: number | null }
  > = {};

  protected nuevoChecklist: { descripcion: string; perecedero: boolean; unidad_por_defecto: string } = {
    descripcion: '',
    perecedero: true,
    unidad_por_defecto: '',
  };

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
      void this.cargarChecklist();
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarChecklist(): Promise<void> {
    this.cargandoChecklist.set(true);
    this.errorChecklist.set('');
    try {
      const items = await firstValueFrom(
        this.http.get<ChecklistItem[]>(`${this.config.apiUrl}/alimentos/checklist`, {
          params: { hogar_id: this.hogarId },
        }),
      );
      this.checklist.set(items);
    } catch {
      this.errorChecklist.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoChecklist.set(false);
    }
  }

  protected abrirComprar(p: ChecklistItem): void {
    this.compraChecklist[p.id] = { fecha_ingreso: '', fecha_vencimiento: '', cantidad: null };
    this.mostrarComprar[p.id] = true;
  }

  protected async comprarDeChecklist(p: ChecklistItem): Promise<void> {
    const datos = this.compraChecklist[p.id];
    if (!datos || datos.cantidad === null) return;
    this.comprandoId.set(p.id);
    this.errorChecklist.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<Alimento>(`${this.config.apiUrl}/alimentos/checklist/${p.id}/comprar`, {
          fecha_ingreso: datos.fecha_ingreso,
          fecha_vencimiento: p.perecedero ? datos.fecha_vencimiento || null : null,
          cantidad: datos.cantidad,
          unidad: p.unidad_por_defecto || null,
        }),
      );
      this.alimentos.set([creado, ...this.alimentos()]);
      this.mostrarComprar[p.id] = false;
    } catch (e) {
      this.errorChecklist.set(this.mensajeError(e));
    } finally {
      this.comprandoId.set(null);
    }
  }

  protected async crearChecklist(): Promise<void> {
    this.creandoChecklist.set(true);
    this.errorChecklist.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<ChecklistItem>(`${this.config.apiUrl}/alimentos/checklist`, {
          hogar_id: this.hogarId,
          descripcion: this.nuevoChecklist.descripcion,
          perecedero: this.nuevoChecklist.perecedero,
          unidad_por_defecto: this.nuevoChecklist.unidad_por_defecto || null,
        }),
      );
      this.checklist.set([...this.checklist(), creado]);
      this.nuevoChecklist = { descripcion: '', perecedero: true, unidad_por_defecto: '' };
    } catch (e) {
      this.errorChecklist.set(this.mensajeError(e));
    } finally {
      this.creandoChecklist.set(false);
    }
  }

  protected async desactivarChecklist(p: ChecklistItem): Promise<void> {
    this.guardandoChecklistId.set(p.id);
    this.errorChecklist.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<ChecklistItem>(`${this.config.apiUrl}/alimentos/checklist/${p.id}`, { activo: false }),
      );
      this.checklist.set(this.checklist().filter((x) => x.id !== actualizado.id));
    } catch (e) {
      this.errorChecklist.set(this.mensajeError(e));
    } finally {
      this.guardandoChecklistId.set(null);
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
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
