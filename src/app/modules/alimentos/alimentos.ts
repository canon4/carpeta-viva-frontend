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
    <div class="encabezado-modulo">
      <h1>Control de alimentos</h1>
      @if (hogarCargado() && esMadreOAdmin() && !formularioAbierto()) {
        <button type="button" (click)="abrirFormulario()">Registrar compra</button>
      }
    </div>

    <datalist id="unidades">
      <option value="unidades"></option>
      <option value="kg"></option>
      <option value="libras"></option>
      <option value="litros"></option>
      <option value="paquetes"></option>
      <option value="bolsas"></option>
    </datalist>

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="crear()" #f="ngForm" aria-labelledby="tituloCompra">
        <h2 id="tituloCompra">Registrar compra</h2>
        <div class="campos">
          <div class="campo">
            <label for="nDesc">Producto *</label>
            <input id="nDesc" name="nDesc" required autocomplete="off" [(ngModel)]="nuevo.descripcion" />
          </div>
          <div class="campo">
            <label for="nCantidad">Cantidad *</label>
            <input id="nCantidad" name="nCantidad" type="number" inputmode="decimal" min="0" step="0.1" required [(ngModel)]="nuevo.cantidad" />
          </div>
          <div class="campo">
            <label for="nUnidad">Unidad</label>
            <input id="nUnidad" name="nUnidad" list="unidades" autocomplete="off" [(ngModel)]="nuevo.unidad" />
          </div>
          <div class="campo">
            <label for="nFechaIngreso">Fecha de compra *</label>
            <input id="nFechaIngreso" name="nFechaIngreso" type="date" required [max]="hoy" [(ngModel)]="nuevo.fecha_ingreso" />
          </div>
          <div class="campo">
            <label class="casilla">
              <input type="checkbox" name="nPerecedero" [(ngModel)]="nuevo.perecedero" />
              Se daña (perecedero)
            </label>
          </div>
          @if (nuevo.perecedero) {
            <div class="campo">
              <label for="nVencimiento">Fecha de vencimiento *</label>
              <input id="nVencimiento" name="nVencimiento" type="date" required [min]="nuevo.fecha_ingreso" [(ngModel)]="nuevo.fecha_vencimiento" />
            </div>
          }
        </div>
        <p class="nota">Si lo compra seguido, regístrelo como producto habitual y la próxima vez solo indicará cantidad y vencimiento.</p>
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
          <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
        </div>
      </form>
    }

    <div class="filtros">
      <div class="campo">
        <app-selector-hogar [valor]="hogarId" [requerido]="true" (valorChange)="hogarId = $event; cargar()" />
      </div>
      <div class="campo">
        <label for="fVista">Mostrar</label>
        <select id="fVista" [ngModel]="vista" (ngModelChange)="vista = $event; cargar()">
          <option value="disponibles">Disponibles</option>
          <option value="vencidos">Vencidos</option>
          <option value="consumidos">Consumidos</option>
          <option value="todos">Todos</option>
        </select>
      </div>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (cargando()) {
      <p class="nota" role="status">Cargando alimentos...</p>
    } @else if (!hogarCargado()) {
      <p class="nota">Elija un hogar para ver sus alimentos.</p>
    } @else if (alimentos().length === 0) {
      <p class="nota">No hay alimentos para mostrar.</p>
    } @else {
      <table class="tabla-datos" aria-label="Alimentos">
        <thead>
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Cantidad</th>
            <th scope="col">Compra</th>
            <th scope="col">Vence</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (a of alimentos(); track a.id) {
            <tr>
              <td data-etiqueta="Producto"><strong>{{ a.descripcion }}</strong></td>
              <td data-etiqueta="Cantidad">{{ a.cantidad }} {{ a.unidad || '' }}</td>
              <td data-etiqueta="Compra">{{ a.fecha_ingreso }}</td>
              <td data-etiqueta="Vence">{{ a.perecedero ? (a.fecha_vencimiento || 'Sin fecha') : 'No se daña' }}</td>
              <td data-etiqueta="Estado">
                @if (a.consumido) {
                  <span class="estado">Consumido</span>
                } @else {
                  <div class="acciones-fila">
                    @if (esVencido(a)) {
                      <span class="estado estado-evadido">Vencido</span>
                    } @else {
                      <span class="estado estado-activo">Disponible</span>
                    }
                    @if (esMadreOAdmin()) {
                      <button type="button" class="boton-secundario" (click)="marcarConsumido(a)" [disabled]="guardandoId() === a.id">
                        {{ guardandoId() === a.id ? 'Guardando...' : 'Se consumió' }}
                      </button>
                    }
                  </div>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }

    @if (hogarCargado()) {
      <section class="seccion" aria-labelledby="tituloHabituales">
        <div class="encabezado-modulo">
          <h2 id="tituloHabituales">Productos habituales</h2>
          @if (esMadreOAdmin() && !formularioProductoAbierto()) {
            <button type="button" class="boton-secundario" (click)="formularioProductoAbierto.set(true)">Agregar producto habitual</button>
          }
        </div>

        @if (errorChecklist()) {
          <p class="error" role="alert">{{ errorChecklist() }}</p>
        }

        @if (formularioProductoAbierto()) {
          <form class="panel-formulario" (ngSubmit)="crearChecklist()" #fc="ngForm" aria-label="Agregar producto habitual">
            <div class="campos">
              <div class="campo">
                <label for="nDescChk">Producto *</label>
                <input id="nDescChk" name="nDescChk" required autocomplete="off" [(ngModel)]="nuevoChecklist.descripcion" />
              </div>
              <div class="campo">
                <label for="nUnidadChk">Unidad</label>
                <input id="nUnidadChk" name="nUnidadChk" list="unidades" autocomplete="off" [(ngModel)]="nuevoChecklist.unidad_por_defecto" />
              </div>
              <div class="campo">
                <label class="casilla">
                  <input type="checkbox" name="nPerecederoChk" [(ngModel)]="nuevoChecklist.perecedero" />
                  Se daña (perecedero)
                </label>
              </div>
            </div>
            <div class="acciones">
              <button type="submit" [disabled]="fc.invalid || creandoChecklist()">{{ creandoChecklist() ? 'Guardando...' : 'Guardar' }}</button>
              <button type="button" class="boton-secundario" (click)="formularioProductoAbierto.set(false)">Cancelar</button>
            </div>
          </form>
        }

        @if (productoComprando(); as p) {
          <form class="panel-formulario" (ngSubmit)="comprarDeChecklist(p)" #fcp="ngForm" aria-labelledby="tituloComprar">
            <h3 id="tituloComprar">Comprar de nuevo: {{ p.descripcion }}</h3>
            <div class="campos">
              <div class="campo">
                <label for="cCantidad">Cantidad{{ p.unidad_por_defecto ? ' (' + p.unidad_por_defecto + ')' : '' }} *</label>
                <input id="cCantidad" name="cCantidad" type="number" inputmode="decimal" min="0" step="0.1" required [(ngModel)]="compraChecklist[p.id].cantidad" />
              </div>
              @if (p.perecedero) {
                <div class="campo">
                  <label for="cVence">Fecha de vencimiento *</label>
                  <input id="cVence" name="cVence" type="date" required [min]="compraChecklist[p.id].fecha_ingreso" [(ngModel)]="compraChecklist[p.id].fecha_vencimiento" />
                </div>
              }
              <div class="campo">
                <label for="cIngreso">Fecha de compra *</label>
                <input id="cIngreso" name="cIngreso" type="date" required [max]="hoy" [(ngModel)]="compraChecklist[p.id].fecha_ingreso" />
              </div>
            </div>
            <div class="acciones">
              <button type="submit" [disabled]="fcp.invalid || comprandoId() === p.id">{{ comprandoId() === p.id ? 'Guardando...' : 'Guardar compra' }}</button>
              <button type="button" class="boton-secundario" (click)="productoComprandoId.set(null)">Cancelar</button>
            </div>
          </form>
        }

        @if (cargandoChecklist()) {
          <p class="nota" role="status">Cargando productos habituales...</p>
        } @else if (checklist().length === 0) {
          <p class="nota">Este hogar no tiene productos habituales.</p>
        } @else {
          <table class="tabla-datos" aria-label="Productos habituales">
            <thead>
              <tr>
                <th scope="col">Producto</th>
                <th scope="col">Unidad</th>
                <th scope="col">Se daña</th>
                @if (esMadreOAdmin()) {
                  <th scope="col">Acciones</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (p of checklist(); track p.id) {
                <tr>
                  <td data-etiqueta="Producto"><strong>{{ p.descripcion }}</strong></td>
                  <td data-etiqueta="Unidad">{{ p.unidad_por_defecto || '—' }}</td>
                  <td data-etiqueta="Se daña">{{ p.perecedero ? 'Sí' : 'No' }}</td>
                  @if (esMadreOAdmin()) {
                    <td data-etiqueta="Acciones">
                      <div class="acciones-fila">
                        <button type="button" (click)="abrirComprar(p)">Comprar</button>
                        <button type="button" class="boton-secundario" (click)="desactivarChecklist(p)" [disabled]="guardandoChecklistId() === p.id">Ya no lo compro</button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        }
      </section>
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
  /** Un solo filtro en lugar de tres (perecedero, consumido, vencidos). */
  protected vista: 'disponibles' | 'vencidos' | 'consumidos' | 'todos' = 'disponibles';
  protected readonly hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local (toISOString usa UTC)
  protected readonly formularioAbierto = signal(false);
  protected readonly formularioProductoAbierto = signal(false);
  protected readonly productoComprandoId = signal<string | null>(null);
  protected readonly productoComprando = computed(
    () => this.checklist().find((p) => p.id === this.productoComprandoId()) ?? null,
  );

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
    const vista = this.route.snapshot.queryParamMap.get('vista');
    if (vista === 'vencidos' || vista === 'consumidos' || vista === 'todos') this.vista = vista;
    if (this.route.snapshot.queryParamMap.get('nuevo') === '1' && this.esMadreOAdmin()) this.abrirFormulario();
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
      if (this.vista === 'disponibles') params['consumido'] = 'false';
      if (this.vista === 'consumidos') params['consumido'] = 'true';
      if (this.vista === 'vencidos') params['vencidos'] = 'true';
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
    // La fecha de compra parte en hoy: casi siempre se registra el mismo día.
    this.compraChecklist[p.id] = { fecha_ingreso: this.hoy, fecha_vencimiento: '', cantidad: null };
    this.productoComprandoId.set(p.id);
  }

  protected abrirFormulario(): void {
    this.nuevo = { descripcion: '', fecha_ingreso: this.hoy, cantidad: null, unidad: '', perecedero: true, fecha_vencimiento: '' };
    this.formularioAbierto.set(true);
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
      this.productoComprandoId.set(null);
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
      this.formularioProductoAbierto.set(false);
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
      this.formularioAbierto.set(false);
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
