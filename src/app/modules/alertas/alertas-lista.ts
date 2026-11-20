import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import { SelectorMenor } from '../../shared/selector-menor/selector-menor';
import type { components } from '../../core/api/schema';

type Alerta = components['schemas']['AlertaOut'];
type Menor = components['schemas']['MenorOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

const ETIQUETAS_TIPO: Record<string, string> = {
  evasion: 'Evasión',
  visita_vencida: 'Visita vencida',
  documento_faltante: 'Documento faltante',
};

function etiquetaTipo(tipo: string): string {
  return ETIQUETAS_TIPO[tipo] ?? tipo;
}

/**
 * Lista de alertas visibles para el usuario. Destaca primero las pendientes propias
 * (destinatario sin `visto_en`), antes que el resto del panel: son alertas de seguridad de NNA,
 * no se mezclan como una fila más entre muchas.
 */
@Component({
  selector: 'app-alertas-lista',
  imports: [FormsModule, RouterLink, SelectorMenor],
  template: `
    <div class="encabezado-modulo">
      <h1>Alertas y evasiones</h1>
      <a routerLink="/alertas/reportar-evasion" class="boton-emergencia">Reportar una evasión</a>
    </div>

    @if (pendientes().length > 0) {
      <section class="panel-formulario alerta-pendiente" role="alert" aria-labelledby="tituloPendientes">
        <h2 id="tituloPendientes">Tiene {{ pendientes().length }} {{ pendientes().length === 1 ? 'alerta sin ver' : 'alertas sin ver' }}</h2>
        <table class="tabla-datos" aria-label="Alertas sin ver">
          <tbody>
            @for (a of pendientes(); track a.id) {
              <tr>
                <td data-etiqueta="Tipo"><strong>{{ etiquetaTipo(a.tipo) }}</strong></td>
                <td data-etiqueta="Menor">{{ nombreMenor(a.menor_id) }}</td>
                <td data-etiqueta="Detalle">{{ a.descripcion }}</td>
                <td data-etiqueta="Acción">
                  <button type="button" (click)="marcarVisto(a)" [disabled]="guardandoId() === a.id">
                    {{ guardandoId() === a.id ? 'Marcando...' : 'Ya la vi' }}
                  </button>
                </td>
              </tr>
            }
          </tbody>
        </table>
      </section>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="filtros">
      <div class="campo">
        <label for="fVista">Mostrar</label>
        <select id="fVista" [ngModel]="vista()" (ngModelChange)="vista.set($event); filtrar()">
          <option value="panel">Mis menores o mi zona</option>
          <option value="buscar">Buscar</option>
        </select>
      </div>
      @if (vista() === 'buscar') {
        <div class="campo">
          <app-selector-menor etiqueta="Menor" opcionVacia="Todos los menores" [valor]="filtroMenorId" (valorChange)="filtroMenorId = $event; filtrar()" />
        </div>
        <div class="campo">
          <label for="fTipo">Tipo</label>
          <select id="fTipo" [ngModel]="filtroTipo" (ngModelChange)="filtroTipo = $event; filtrar()">
            <option value="">Todos</option>
            <option value="evasion">Evasión</option>
            <option value="visita_vencida">Visita vencida</option>
            <option value="documento_faltante">Documento faltante</option>
          </select>
        </div>
        <div class="campo">
          <label for="fEstado">Estado</label>
          <select id="fEstado" [ngModel]="filtroEstado" (ngModelChange)="filtroEstado = $event; filtrar()">
            <option value="">Todos</option>
            <option value="activa">Activa</option>
            <option value="cerrada">Cerrada</option>
          </select>
        </div>
      }
    </div>

    @if (alertaSeleccionada(); as a) {
      <section class="panel-formulario" aria-labelledby="tituloDestinatarios">
        <h2 id="tituloDestinatarios">Quién recibió la alerta</h2>
        <p class="nota">{{ etiquetaTipo(a.tipo) }} · {{ nombreMenor(a.menor_id) }} · {{ fechaLegible(a.created_at) }}</p>
        <table class="tabla-datos" aria-label="Destinatarios">
          <thead>
            <tr><th scope="col">Destinatario</th><th scope="col">La vio</th></tr>
          </thead>
          <tbody>
            @for (d of a.destinatarios ?? []; track d.id) {
              <tr>
                <td data-etiqueta="Destinatario">{{ esMiFila(d) ? 'Usted' : 'Usuario ' + d.usuario_id.slice(0, 8) }}</td>
                <td data-etiqueta="La vio">
                  @if (d.visto_en) {
                    {{ fechaLegible(d.visto_en) }}
                  } @else if (esMiFila(d)) {
                    <button type="button" (click)="marcarVisto(a)" [disabled]="guardandoId() === a.id">Ya la vi</button>
                  } @else {
                    <span class="estado estado-flujo-en_revision">Sin ver</span>
                  }
                </td>
              </tr>
            }
          </tbody>
        </table>
        <div class="acciones">
          <button type="button" class="boton-secundario" (click)="seleccionadaId.set(null)">Cerrar</button>
        </div>
      </section>
    }

    @if (cargando()) {
      <p class="nota" role="status">Cargando alertas...</p>
    } @else if (alertas().length === 0) {
      <p class="nota">No hay alertas para mostrar.</p>
    } @else {
      <table class="tabla-datos" aria-label="Alertas">
        <thead>
          <tr>
            <th scope="col">Tipo</th>
            <th scope="col">Menor</th>
            <th scope="col">Detalle</th>
            <th scope="col">Fecha</th>
            <th scope="col">Estado</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (a of alertas(); track a.id) {
            <tr>
              <td data-etiqueta="Tipo"><strong>{{ etiquetaTipo(a.tipo) }}</strong></td>
              <td data-etiqueta="Menor">{{ nombreMenor(a.menor_id) }}</td>
              <td data-etiqueta="Detalle">{{ a.descripcion }}</td>
              <td data-etiqueta="Fecha">{{ fechaLegible(a.created_at) }}</td>
              <td data-etiqueta="Estado">
                <span [class]="a.estado === 'activa' ? 'estado estado-evadido' : 'estado'">{{ a.estado === 'activa' ? 'Activa' : 'Cerrada' }}</span>
              </td>
              <td data-etiqueta="Acciones">
                <div class="acciones-fila">
                  @if ((a.destinatarios ?? []).length > 0) {
                    <button type="button" class="boton-secundario" (click)="seleccionadaId.set(a.id)">Quién la vio ({{ vistas(a) }}/{{ (a.destinatarios ?? []).length }})</button>
                  }
                  @if (a.estado === 'activa' && puedeCerrar(a)) {
                    <button type="button" class="boton-secundario" (click)="cerrar(a)" [disabled]="guardandoId() === a.id">
                      {{ guardandoId() === a.id ? 'Cerrando...' : 'Cerrar' }}
                    </button>
                  }
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [
    `
      /* Acción de emergencia: siempre visible, roja y grande. */
      .boton-emergencia {
        display: inline-flex;
        align-items: center;
        min-height: var(--tamano-tactil);
        padding: 0 1.25rem;
        background: #b00020;
        color: #ffffff;
        font-weight: 700;
        border-radius: var(--radio);
        text-decoration: none;
      }
      .boton-emergencia:hover { background: #8a0019; }
      .alerta-pendiente {
        border: 2px solid #b00020;
      }
    `,
  ],
})
export class AlertasLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly etiquetaTipo = etiquetaTipo;

  protected readonly alertas = signal<Alerta[]>([]);
  protected readonly pendientes = signal<Alerta[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardandoId = signal<string | null>(null);

  protected filtroMenorId = '';
  protected filtroTipo = '';
  protected filtroEstado = '';
  /** "panel": las alertas de mis menores o mi zona (genera las automáticas); "buscar": con filtros. */
  protected readonly vista = signal<'panel' | 'buscar'>('panel');
  protected readonly seleccionadaId = signal<string | null>(null);
  protected readonly alertaSeleccionada = computed(
    () => this.alertas().find((a) => a.id === this.seleccionadaId()) ?? null,
  );
  private readonly nombres = signal<Record<string, string>>({});

  protected nombreMenor(id: string): string {
    return this.nombres()[id] ?? 'Menor';
  }

  protected vistas(a: Alerta): number {
    return (a.destinatarios ?? []).filter((d) => !!d.visto_en).length;
  }

  protected fechaLegible(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return iso;
    return fecha.toLocaleString('es-CO', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  private async cargarNombres(): Promise<void> {
    try {
      const menores = await firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`));
      this.nombres.set(Object.fromEntries(menores.map((m) => [m.id, `${m.nombres} ${m.apellidos}`])));
    } catch {
      /* sin nombres se muestra "Menor" */
    }
  }

  protected readonly puedeGestionar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    if (this.filtroMenorId) this.vista.set('buscar');
    void this.cargarPendientes();
    void this.cargar();
    void this.cargarNombres();
  }

  protected esMiFila(d: components['schemas']['AlertaDestinatarioOut']): boolean {
    return d.usuario_id === this.auth.usuario()?.id;
  }

  protected puedeCerrar(a: Alerta): boolean {
    return this.puedeGestionar() || a.generada_por === this.auth.usuario()?.id;
  }

  private async cargarPendientes(): Promise<void> {
    try {
      this.pendientes.set(
        await firstValueFrom(this.http.get<Alerta[]>(`${this.config.apiUrl}/alertas/mis-pendientes`)),
      );
    } catch {
      this.pendientes.set([]);
    }
  }

  protected filtrar(): void {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const panel = this.vista() === 'panel';
    this.cargando.set(true);
    this.error.set('');
    try {
      if (panel) {
        this.alertas.set(await firstValueFrom(this.http.get<Alerta[]>(`${this.config.apiUrl}/alertas/panel`)));
      } else {
        const params: Record<string, string> = {};
        if (this.filtroMenorId.trim()) params['menor_id'] = this.filtroMenorId.trim();
        if (this.filtroTipo) params['tipo'] = this.filtroTipo;
        if (this.filtroEstado) params['estado'] = this.filtroEstado;
        this.alertas.set(await firstValueFrom(this.http.get<Alerta[]>(`${this.config.apiUrl}/alertas`, { params })));
      }
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async marcarVisto(a: Alerta): Promise<void> {
    this.guardandoId.set(a.id);
    this.error.set('');
    try {
      await firstValueFrom(this.http.put(`${this.config.apiUrl}/alertas/${a.id}/visto`, {}));
      await Promise.all([this.cargarPendientes(), this.cargar()]);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  protected async cerrar(a: Alerta): Promise<void> {
    this.guardandoId.set(a.id);
    this.error.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Alerta>(`${this.config.apiUrl}/alertas/${a.id}/cerrar`, {}),
      );
      this.alertas.set(this.alertas().map((x) => (x.id === actualizada.id ? actualizada : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      return 'Su rol no tiene permiso para realizar esta acción.';
    }
    return MENSAJE_GENERICO;
  }
}
