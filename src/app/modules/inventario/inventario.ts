import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import { SelectorHogar } from '../../shared/selector-hogar/selector-hogar';
import type { components } from '../../core/api/schema';

type Item = components['schemas']['InventarioItemOut'];
type Conviviente = components['schemas']['ConvivienteOut'];
type RedApoyo = components['schemas']['RedApoyoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Inventario del hogar (no del menor): camas y muebles, personas que conviven en el hogar
 * (distintas de los NNA y la madre) y red de apoyo. Nunca se borra nada: un ítem se marca
 * `retirado` y un conviviente o contacto de red de apoyo se desactiva (`activo = false`).
 */
@Component({
  selector: 'app-inventario',
  imports: [FormsModule, SelectorHogar],
  template: `
    <h1>Inventario del Hogar</h1>

    <form class="formulario" (ngSubmit)="cargarTodo()">
      <app-selector-hogar [(valor)]="hogarId" [requerido]="true" />
      <button type="submit" [disabled]="!hogarId.trim() || cargando()">Cargar</button>
    </form>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (hogarCargado()) {
      <section class="tarjeta">
        <h2>Camas y muebles</h2>
        <ul class="lista-simple">
          @for (i of items(); track i.id) {
            <li>
              <p>{{ i.tipo }} — {{ i.descripcion }} (cantidad: {{ i.cantidad }})</p>
              <p>Estado: {{ i.estado }}</p>
              <label [for]="'estadoItem-' + i.id">Cambiar estado</label>
              <select [id]="'estadoItem-' + i.id" [(ngModel)]="estadoItemEdicion[i.id]" [name]="'estadoItem-' + i.id">
                <option value="bueno">Bueno</option>
                <option value="regular">Regular</option>
                <option value="malo">Malo</option>
                <option value="retirado">Retirado (sustituye a eliminar)</option>
              </select>
              <button type="button" (click)="actualizarItem(i)" [disabled]="guardandoId() === i.id">
                Guardar
              </button>
            </li>
          }
          @if (items().length === 0) {
            <p class="nota">Este hogar no tiene ítems de inventario registrados.</p>
          }
        </ul>
        <form class="formulario" (ngSubmit)="crearItem()" #fi="ngForm">
          <h3>Registrar ítem</h3>
          <label for="nTipoItem">Tipo</label>
          <select id="nTipoItem" name="nTipoItem" required [(ngModel)]="nuevoItem.tipo">
            <option value="cama">Cama</option>
            <option value="mueble">Mueble</option>
            <option value="otro">Otro</option>
          </select>
          <label for="nDescItem">Descripción</label>
          <input id="nDescItem" name="nDescItem" required [(ngModel)]="nuevoItem.descripcion" />
          <label for="nCantItem">Cantidad</label>
          <input id="nCantItem" name="nCantItem" type="number" min="1" required [(ngModel)]="nuevoItem.cantidad" />
          <button type="submit" [disabled]="fi.invalid || guardando()">Registrar</button>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Personas que viven en el hogar</h2>
        <ul class="lista-simple">
          @for (c of convivientes(); track c.id) {
            <li>
              <p>{{ c.nombres }} — {{ c.relacion_con_madre }}</p>
              <p>Desde: {{ c.fecha_desde || 'Sin registrar' }}</p>
              <p>Estado: {{ c.activo ? 'Vive en el hogar' : 'Ya no vive en el hogar' }}</p>
              @if (c.activo) {
                <button type="button" (click)="desactivarConviviente(c)" [disabled]="guardandoId() === c.id">
                  Marcar que ya no vive aquí
                </button>
              }
            </li>
          }
          @if (convivientes().length === 0) {
            <p class="nota">No hay otras personas registradas en este hogar.</p>
          }
        </ul>
        <form class="formulario" (ngSubmit)="crearConviviente()" #fc="ngForm">
          <h3>Registrar persona</h3>
          <label for="nNombresConv">Nombres</label>
          <input id="nNombresConv" name="nNombresConv" required [(ngModel)]="nuevoConviviente.nombres" />
          <label for="nRelacionConv">Relación con la madre</label>
          <input id="nRelacionConv" name="nRelacionConv" required [(ngModel)]="nuevoConviviente.relacion_con_madre" />
          <label for="nFechaConv">Vive desde (opcional)</label>
          <input id="nFechaConv" name="nFechaConv" type="date" [(ngModel)]="nuevoConviviente.fecha_desde" />
          <button type="submit" [disabled]="fc.invalid || guardando()">Registrar</button>
        </form>
      </section>

      <section class="tarjeta">
        <h2>Red de apoyo</h2>
        <ul class="lista-simple">
          @for (r of redApoyo(); track r.id) {
            <li>
              <p>{{ r.nombres }} — {{ r.relacion }}</p>
              <p>Teléfono: {{ r.telefono || 'Sin registrar' }}</p>
              <p>Estado: {{ r.activo ? 'Activo' : 'Desactivado' }}</p>
              @if (r.activo) {
                <button type="button" (click)="desactivarRedApoyo(r)" [disabled]="guardandoId() === r.id">
                  Desactivar
                </button>
              }
            </li>
          }
          @if (redApoyo().length === 0) {
            <p class="nota">No hay contactos de red de apoyo registrados.</p>
          }
        </ul>
        <form class="formulario" (ngSubmit)="crearRedApoyo()" #fr="ngForm">
          <h3>Registrar contacto</h3>
          <label for="nNombresRed">Nombres</label>
          <input id="nNombresRed" name="nNombresRed" required [(ngModel)]="nuevoRedApoyo.nombres" />
          <label for="nRelacionRed">Relación</label>
          <input id="nRelacionRed" name="nRelacionRed" required [(ngModel)]="nuevoRedApoyo.relacion" />
          <label for="nTelefonoRed">Teléfono (opcional)</label>
          <input id="nTelefonoRed" name="nTelefonoRed" [(ngModel)]="nuevoRedApoyo.telefono" />
          <button type="submit" [disabled]="fr.invalid || guardando()">Registrar</button>
        </form>
      </section>
    }
  `,
})
export class Inventario {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);

  protected hogarId = '';
  protected readonly hogarCargado = signal(false);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly guardandoId = signal<string | null>(null);
  protected readonly error = signal('');

  protected readonly items = signal<Item[]>([]);
  protected readonly convivientes = signal<Conviviente[]>([]);
  protected readonly redApoyo = signal<RedApoyo[]>([]);
  protected readonly estadoItemEdicion: Record<string, string> = {};

  protected nuevoItem = { tipo: 'cama', descripcion: '', cantidad: 1 };
  protected nuevoConviviente = { nombres: '', relacion_con_madre: '', fecha_desde: '' };
  protected nuevoRedApoyo = { nombres: '', relacion: '', telefono: '' };

  constructor() {
    this.hogarId = this.route.snapshot.queryParamMap.get('hogar_id') ?? '';
    if (this.hogarId) void this.cargarTodo();
  }

  protected async cargarTodo(): Promise<void> {
    if (!this.hogarId.trim()) return;
    this.cargando.set(true);
    this.error.set('');
    try {
      const [items, convivientes, redApoyo] = await Promise.all([
        firstValueFrom(
          this.http.get<Item[]>(`${this.config.apiUrl}/inventario/items`, { params: { hogar_id: this.hogarId } }),
        ),
        firstValueFrom(
          this.http.get<Conviviente[]>(`${this.config.apiUrl}/inventario/convivientes`, {
            params: { hogar_id: this.hogarId },
          }),
        ),
        firstValueFrom(
          this.http.get<RedApoyo[]>(`${this.config.apiUrl}/inventario/red-apoyo`, {
            params: { hogar_id: this.hogarId },
          }),
        ),
      ]);
      this.items.set(items);
      for (const i of items) this.estadoItemEdicion[i.id] = i.estado;
      this.convivientes.set(convivientes);
      this.redApoyo.set(redApoyo);
      this.hogarCargado.set(true);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crearItem(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<Item>(`${this.config.apiUrl}/inventario/items`, {
          hogar_id: this.hogarId,
          tipo: this.nuevoItem.tipo,
          descripcion: this.nuevoItem.descripcion,
          cantidad: this.nuevoItem.cantidad,
        }),
      );
      this.items.set([...this.items(), creado]);
      this.estadoItemEdicion[creado.id] = creado.estado;
      this.nuevoItem = { tipo: 'cama', descripcion: '', cantidad: 1 };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async actualizarItem(i: Item): Promise<void> {
    this.guardandoId.set(i.id);
    this.error.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Item>(`${this.config.apiUrl}/inventario/items/${i.id}`, {
          estado: this.estadoItemEdicion[i.id],
        }),
      );
      this.items.set(this.items().map((x) => (x.id === actualizado.id ? actualizado : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  protected async crearConviviente(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<Conviviente>(`${this.config.apiUrl}/inventario/convivientes`, {
          hogar_id: this.hogarId,
          nombres: this.nuevoConviviente.nombres,
          relacion_con_madre: this.nuevoConviviente.relacion_con_madre,
          fecha_desde: this.nuevoConviviente.fecha_desde || null,
        }),
      );
      this.convivientes.set([...this.convivientes(), creado]);
      this.nuevoConviviente = { nombres: '', relacion_con_madre: '', fecha_desde: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async desactivarConviviente(c: Conviviente): Promise<void> {
    this.guardandoId.set(c.id);
    this.error.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Conviviente>(`${this.config.apiUrl}/inventario/convivientes/${c.id}`, { activo: false }),
      );
      this.convivientes.set(this.convivientes().map((x) => (x.id === actualizado.id ? actualizado : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  protected async crearRedApoyo(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<RedApoyo>(`${this.config.apiUrl}/inventario/red-apoyo`, {
          hogar_id: this.hogarId,
          nombres: this.nuevoRedApoyo.nombres,
          relacion: this.nuevoRedApoyo.relacion,
          telefono: this.nuevoRedApoyo.telefono || null,
        }),
      );
      this.redApoyo.set([...this.redApoyo(), creado]);
      this.nuevoRedApoyo = { nombres: '', relacion: '', telefono: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async desactivarRedApoyo(r: RedApoyo): Promise<void> {
    this.guardandoId.set(r.id);
    this.error.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<RedApoyo>(`${this.config.apiUrl}/inventario/red-apoyo/${r.id}`, { activo: false }),
      );
      this.redApoyo.set(this.redApoyo().map((x) => (x.id === actualizado.id ? actualizado : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para gestionar el inventario de este hogar.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
