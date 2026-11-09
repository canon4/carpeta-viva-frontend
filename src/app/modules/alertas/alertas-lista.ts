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
    <h1>Alertas y Evasiones</h1>

    <p>
      <a routerLink="/alertas/reportar-evasion" class="boton-destacado">Reportar una evasión ahora</a>
    </p>

    @if (pendientes().length > 0) {
      <section class="tarjeta alerta-pendiente" role="alert">
        <h2>Tiene {{ pendientes().length }} alerta(s) sin ver</h2>
        <ul class="lista-simple">
          @for (a of pendientes(); track a.id) {
            <li>
              <p><strong>{{ etiquetaTipo(a.tipo) }}</strong> — {{ a.descripcion }}</p>
              <p>Menor: {{ a.menor_id }} — Creada: {{ a.created_at }}</p>
              <button type="button" (click)="marcarVisto(a)" [disabled]="guardandoId() === a.id">
                {{ guardandoId() === a.id ? 'Marcando...' : 'Marcar como vista' }}
              </button>
            </li>
          }
        </ul>
      </section>
    }

    <form class="formulario" (ngSubmit)="filtrar()">
      <app-selector-menor [(valor)]="filtroMenorId" etiqueta="Menor (opcional)" opcionVacia="Todos los menores" />
      <label for="fTipo">Tipo (opcional)</label>
      <select id="fTipo" name="fTipo" [(ngModel)]="filtroTipo">
        <option value="">Todos</option>
        <option value="evasion">Evasión</option>
        <option value="visita_vencida">Visita vencida</option>
        <option value="documento_faltante">Documento faltante</option>
      </select>
      <label for="fEstado">Estado (opcional)</label>
      <select id="fEstado" name="fEstado" [(ngModel)]="filtroEstado">
        <option value="">Todos</option>
        <option value="activa">Activa</option>
        <option value="cerrada">Cerrada</option>
      </select>
      <button type="submit" [disabled]="cargando()">Filtrar</button>
      <button type="button" (click)="verPanel()" [disabled]="cargando()">Ver panel (mis menores / mi zona)</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando alertas...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (a of alertas(); track a.id) {
        <li class="tarjeta" [class.alerta-activa]="a.estado === 'activa'">
          <p><strong>{{ etiquetaTipo(a.tipo) }}</strong> — Estado: {{ a.estado }}</p>
          <p>Menor: {{ a.menor_id }} — Origen: {{ a.origen }}</p>
          <p>{{ a.descripcion }}</p>
          <p>Creada: {{ a.created_at }}</p>

          @if (a.destinatarios && a.destinatarios.length > 0) {
            <p>Destinatarios:</p>
            <ul class="lista-simple">
              @for (d of a.destinatarios; track d.id) {
                <li>
                  Usuario {{ d.usuario_id }} —
                  {{ d.visto_en ? 'Vista el ' + d.visto_en : 'Sin ver todavía' }}
                  @if (esMiFila(d) && !d.visto_en) {
                    <button type="button" (click)="marcarVisto(a)" [disabled]="guardandoId() === a.id">
                      Marcar como vista
                    </button>
                  }
                </li>
              }
            </ul>
          }

          @if (a.estado === 'activa' && puedeCerrar(a)) {
            <button type="button" (click)="cerrar(a)" [disabled]="guardandoId() === a.id">
              {{ guardandoId() === a.id ? 'Cerrando...' : 'Cerrar alerta' }}
            </button>
          }
        </li>
      }
      @if (!cargando() && alertas().length === 0) {
        <p class="nota">No hay alertas para mostrar con estos filtros.</p>
      }
    </ul>
  `,
  styles: [
    `
      .boton-destacado {
        display: inline-block;
        font-weight: bold;
        padding: 0.6rem 1rem;
        border: 2px solid #b00020;
        border-radius: 4px;
      }
      .alerta-pendiente {
        border: 2px solid #b00020;
      }
      .alerta-activa {
        border-left: 4px solid #b00020;
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

  protected readonly puedeGestionar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    void this.cargarPendientes();
    void this.cargar();
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

  protected verPanel(): void {
    void this.cargar(true);
  }

  private async cargar(panel = false): Promise<void> {
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
