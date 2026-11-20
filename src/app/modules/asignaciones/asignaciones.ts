import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { SelectorHogar } from '../../shared/selector-hogar/selector-hogar';

type Asignacion = components['schemas']['AsignacionOut'];
type AsignacionHistoria = components['schemas']['AsignacionHistoryOut'];
type TipoMovimiento = components['schemas']['TipoMovimiento'];
type Menor = components['schemas']['MenorOut'];
type Hogar = components['schemas']['HogarOut'];
type Zona = components['schemas']['ZonaOut'];
type Madre = components['schemas']['MadreOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

const MOTIVOS_EGRESO = ['Reintegro familiar', 'Adopción', 'Mayoría de edad', 'Cambio de medida', 'Otro'];

const hoy = () => new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local

/**
 * Asignaciones y traslados: vincula un menor con un hogar (ingreso o traslado) y registra el egreso.
 * El egreso oculta el expediente a la madre (RF7): se confirma en un panel aparte, nunca con un
 * botón suelto. El formulario solo ofrece las opciones válidas para cada movimiento.
 */
@Component({
  selector: 'app-asignaciones',
  imports: [FormsModule, RouterLink, SelectorHogar],
  template: `
    <div class="encabezado-modulo">
      <h1>Asignaciones y traslados</h1>
      @if (puedeCrear() && !formularioAbierto()) {
        <button type="button" (click)="abrirFormulario('ingreso')">Registrar ingreso</button>
      }
    </div>

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="crear()" #f="ngForm" aria-labelledby="tituloAsignacion">
        <h2 id="tituloAsignacion">{{ nueva.tipo_movimiento === 'traslado' ? 'Trasladar a otro hogar' : 'Registrar ingreso a un hogar' }}</h2>
        <div class="campos">
          <div class="campo">
            <label for="nTipo">Movimiento *</label>
            <select id="nTipo" name="nTipo" required [ngModel]="nueva.tipo_movimiento" (ngModelChange)="cambiarTipo($event)">
              <option value="ingreso">Ingreso (el menor no tiene hogar)</option>
              <option value="traslado">Traslado (cambia de hogar)</option>
            </select>
          </div>
          <div class="campo">
            <label for="nMenor">Menor *</label>
            <select id="nMenor" name="nMenor" required [(ngModel)]="nueva.menor_id" (ngModelChange)="nueva.hogar_id = ''; menorFormulario.set($event)" [disabled]="cargandoFiltros()">
              <option value="" disabled>{{ menoresDelFormulario().length ? 'Seleccione un menor' : 'No hay menores para este movimiento' }}</option>
              @for (m of menoresDelFormulario(); track m.id) {
                <option [value]="m.id">{{ m.nombres }} {{ m.apellidos }}</option>
              }
            </select>
            @if (nueva.tipo_movimiento === 'traslado' && hogarActualDe(nueva.menor_id); as actual) {
              <span class="nota">Hogar actual: {{ etiquetaHogarPorId(actual) }}</span>
            }
          </div>
          <div class="campo">
            @if (puedeVerHogaresYZonas()) {
              <label for="nHogar">Hogar de destino *</label>
              <select id="nHogar" name="nHogar" required [(ngModel)]="nueva.hogar_id" [disabled]="cargandoFiltros()">
                <option value="" disabled>Seleccione un hogar</option>
                @for (h of hogaresDestino(); track h.id) {
                  <option [value]="h.id">{{ etiquetaHogar(h) }}</option>
                }
              </select>
              @if (!cargandoFiltros() && hogaresDestino().length === 0) {
                <span class="nota">No hay otros hogares activos en su zona para recibir al menor.</span>
              }
            } @else {
              <app-selector-hogar etiqueta="Hogar de destino *" [requerido]="true" [valor]="nueva.hogar_id" (valorChange)="nueva.hogar_id = $event" />
            }
          </div>
          <div class="campo">
            <label for="nFechaInicio">Fecha *</label>
            <input id="nFechaInicio" name="nFechaInicio" type="date" required [max]="hoy" [(ngModel)]="nueva.fecha_inicio" />
          </div>
          <div class="campo">
            <label for="nActa">Número del acta</label>
            <input id="nActa" name="nActa" autocomplete="off" [(ngModel)]="nueva.acta_referencia" />
          </div>
          @if (nueva.tipo_movimiento === 'traslado') {
            <div class="campo">
              <label for="nMotivo">Motivo del traslado</label>
              <input id="nMotivo" name="nMotivo" autocomplete="off" [(ngModel)]="nueva.motivo" />
            </div>
          }
        </div>
        @if (nueva.tipo_movimiento === 'traslado') {
          <p class="nota">Al guardar, la asignación anterior se cierra y la madre del hogar anterior deja de ver el expediente.</p>
        }
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
          <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
        </div>
      </form>
    }

    @if (egresoAsignacion(); as a) {
      <form class="panel-formulario" (ngSubmit)="confirmarEgreso(a)" #fe="ngForm" aria-labelledby="tituloEgreso">
        <h2 id="tituloEgreso">Registrar egreso de {{ nombreMenor(a.menor_id) }}</h2>
        <p class="error" role="alert">
          El menor sale de {{ etiquetaHogarPorId(a.hogar_id) }}: la madre deja de ver el expediente y el menor queda como egresado. No se borra nada.
        </p>
        <div class="campos">
          <div class="campo">
            <label for="fechaFin">Fecha de salida *</label>
            <input id="fechaFin" name="fechaFin" type="date" required [min]="a.fecha_inicio" [max]="hoy" [(ngModel)]="egreso.fecha_fin" />
          </div>
          <div class="campo">
            <label for="motivoEgreso">Motivo *</label>
            <select id="motivoEgreso" name="motivoEgreso" required [(ngModel)]="egreso.motivo">
              <option value="" disabled>Seleccione el motivo</option>
              @for (m of motivosEgreso; track m) {
                <option [value]="m">{{ m }}</option>
              }
            </select>
          </div>
          @if (egreso.motivo === 'Otro') {
            <div class="campo">
              <label for="motivoOtro">¿Cuál? *</label>
              <input id="motivoOtro" name="motivoOtro" required autocomplete="off" [(ngModel)]="egreso.otro" />
            </div>
          }
          <div class="campo">
            <label for="actaEgreso">Número del acta</label>
            <input id="actaEgreso" name="actaEgreso" autocomplete="off" [(ngModel)]="egreso.acta_referencia" />
          </div>
        </div>
        <div class="acciones">
          <button type="submit" [disabled]="fe.invalid || guardandoEgreso()">{{ guardandoEgreso() ? 'Guardando...' : 'Confirmar egreso' }}</button>
          <button type="button" class="boton-secundario" (click)="egresoId.set(null)">Cancelar</button>
        </div>
      </form>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="filtros">
      <div class="campo">
        <label for="fVista">Mostrar</label>
        <select id="fVista" [ngModel]="soloVigentes()" (ngModelChange)="soloVigentes.set($event); filtrar()">
          <option [ngValue]="true">Vigentes</option>
          <option [ngValue]="false">Todas (incluye cerradas)</option>
        </select>
      </div>
      <div class="campo">
        <label for="fMenor">Menor</label>
        <select id="fMenor" [ngModel]="filtroMenorId" (ngModelChange)="filtroMenorId = $event; filtrar()" [disabled]="cargandoFiltros()">
          <option value="">Todos los menores</option>
          @for (m of menores(); track m.id) {
            <option [value]="m.id">{{ m.nombres }} {{ m.apellidos }}</option>
          }
        </select>
      </div>
      <div class="campo">
        @if (puedeVerHogaresYZonas()) {
          <label for="fHogar">Hogar</label>
          <select id="fHogar" [ngModel]="filtroHogarId" (ngModelChange)="filtroHogarId = $event; filtrar()" [disabled]="cargandoFiltros()">
            <option value="">Todos los hogares</option>
            @for (h of hogares(); track h.id) {
              <option [value]="h.id">{{ etiquetaHogar(h) }}</option>
            }
          </select>
        } @else {
          <app-selector-hogar opcionVacia="Todos los hogares" [valor]="filtroHogarId" (valorChange)="filtroHogarId = $event; filtrar()" />
        }
      </div>
      @if (esAdmin()) {
        <div class="campo">
          <label for="fZona">Zona</label>
          <select id="fZona" [ngModel]="filtroZonaId" (ngModelChange)="filtroZonaId = $event; filtrar()" [disabled]="cargandoFiltros()">
            <option value="">Todas las zonas</option>
            @for (z of zonas(); track z.id) {
              <option [value]="z.id">{{ z.nombre }}</option>
            }
          </select>
        </div>
      }
    </div>

    @if (cargando()) {
      <p class="nota" role="status">Cargando asignaciones...</p>
    } @else if (asignaciones().length === 0) {
      <p class="nota">No hay asignaciones para mostrar.</p>
    } @else {
      <table class="tabla-datos" aria-label="Asignaciones">
        <thead>
          <tr>
            <th scope="col">Menor</th>
            <th scope="col">Hogar</th>
            <th scope="col">Movimiento</th>
            <th scope="col">Periodo</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (a of asignaciones(); track a.id) {
            <tr>
              <td data-etiqueta="Menor"><a [routerLink]="['/menores', a.menor_id]">{{ nombreMenor(a.menor_id) }}</a></td>
              <td data-etiqueta="Hogar">{{ etiquetaHogarPorId(a.hogar_id) }}</td>
              <td data-etiqueta="Movimiento">{{ etiquetaMovimiento(a.tipo_movimiento) }}</td>
              <td data-etiqueta="Periodo">
                {{ fecha(a.fecha_inicio) }} –
                @if (a.fecha_fin) { {{ fecha(a.fecha_fin) }} } @else { <span class="estado estado-activo">Vigente</span> }
              </td>
              <td data-etiqueta="Acciones">
                <div class="acciones-fila">
                  @if (puedeCrear() && !a.fecha_fin) {
                    <button type="button" (click)="trasladar(a)">Trasladar</button>
                    <button type="button" class="boton-secundario" (click)="iniciarEgreso(a)">Registrar egreso</button>
                  }
                  <button type="button" class="boton-secundario" (click)="verHistorial(a)" [attr.aria-expanded]="historialSeleccionadoId() === a.id">Historial</button>
                </div>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }

    @if (historialSeleccionadoId()) {
      <section class="panel-formulario" aria-labelledby="tituloHistorial" style="margin-top: 1rem">
        <h2 id="tituloHistorial">Historial de cambios</h2>
        @if (historial().length === 0) {
          <p class="nota">Esta asignación no tiene cambios anteriores.</p>
        } @else {
          <table class="tabla-datos" aria-label="Historial de la asignación">
            <thead>
              <tr><th scope="col">Fecha del cambio</th><th scope="col">Hogar</th><th scope="col">Fin</th><th scope="col">Motivo</th></tr>
            </thead>
            <tbody>
              @for (h of historial(); track h.id) {
                <tr>
                  <td data-etiqueta="Fecha del cambio">{{ fecha(h.created_at) }}</td>
                  <td data-etiqueta="Hogar">{{ etiquetaHogarPorId(h.hogar_id) }}</td>
                  <td data-etiqueta="Fin">{{ h.fecha_fin ? fecha(h.fecha_fin) : 'Sin cerrar' }}</td>
                  <td data-etiqueta="Motivo">{{ h.motivo || 'Sin motivo' }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
        <div class="acciones">
          <button type="button" class="boton-secundario" (click)="historialSeleccionadoId.set(null)">Cerrar historial</button>
        </div>
      </section>
    }
  `,
})
export class Asignaciones {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly hoy = hoy();
  protected readonly motivosEgreso = MOTIVOS_EGRESO;

  protected readonly asignaciones = signal<Asignacion[]>([]);
  /** Asignaciones vigentes de todos los menores visibles: deciden qué menores admite cada movimiento. */
  private readonly vigentes = signal<Asignacion[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly soloVigentes = signal(true);

  // Listar hogares y zonas (`GET /zonas-hogares/...`) solo lo permite el backend a coordinador y admin.
  protected readonly puedeVerHogaresYZonas = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });
  protected readonly esAdmin = computed(() => this.auth.rol() === 'admin');
  // Crean y cierran asignaciones: coordinador de la zona, admin y defensor asignado (el backend valida).
  protected readonly puedeCrear = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'defensor';
  });
  protected readonly formularioAbierto = signal(false);

  protected readonly cargandoFiltros = signal(false);
  protected readonly menores = signal<Menor[]>([]);
  protected readonly hogares = signal<Hogar[]>([]);
  protected readonly zonas = signal<Zona[]>([]);
  private readonly madres = signal<Madre[]>([]);

  protected filtroMenorId = '';
  protected filtroHogarId = '';
  protected filtroZonaId = '';

  protected readonly egresoId = signal<string | null>(null);
  protected readonly guardandoEgreso = signal(false);
  protected egreso = { fecha_fin: '', motivo: '', otro: '', acta_referencia: '' };
  protected readonly egresoAsignacion = computed(() => this.asignaciones().find((a) => a.id === this.egresoId()) ?? null);

  protected readonly historialSeleccionadoId = signal<string | null>(null);
  protected readonly historial = signal<AsignacionHistoria[]>([]);

  protected nueva: {
    menor_id: string;
    hogar_id: string;
    fecha_inicio: string;
    tipo_movimiento: TipoMovimiento;
    acta_referencia: string;
    motivo: string;
  } = { menor_id: '', hogar_id: '', fecha_inicio: hoy(), tipo_movimiento: 'ingreso', acta_referencia: '', motivo: '' };
  private readonly tipoFormulario = signal<TipoMovimiento>('ingreso');
  protected readonly menorFormulario = signal('');

  /** Ingreso: menores activos sin hogar. Traslado: menores con hogar vigente. */
  protected readonly menoresDelFormulario = computed(() => {
    const conHogar = new Set(this.vigentes().map((a) => a.menor_id));
    const traslado = this.tipoFormulario() === 'traslado';
    return this.menores()
      .filter((m) => (traslado ? conHogar.has(m.id) : !conHogar.has(m.id) && m.estado_actual === 'activo'))
      .sort((a, b) => `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`, 'es'));
  });

  /** El hogar de destino nunca es el hogar actual del menor. */
  protected readonly hogaresDestino = computed(() => {
    const actual = this.hogarActualDe(this.menorFormulario());
    return this.hogares().filter((h) => h.id !== actual && h.estado === 'activo');
  });

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    if (this.route.snapshot.queryParamMap.get('nuevo') === '1' && this.puedeCrear()) this.abrirFormulario('ingreso');
    void this.cargar();
    void this.cargarFiltros();
  }

  protected filtrar(): void {
    void this.cargar();
  }

  protected abrirFormulario(tipo: TipoMovimiento, menorId = ''): void {
    this.egresoId.set(null);
    this.nueva = { menor_id: menorId, hogar_id: '', fecha_inicio: hoy(), tipo_movimiento: tipo, acta_referencia: '', motivo: '' };
    this.tipoFormulario.set(tipo);
    this.menorFormulario.set(menorId);
    this.formularioAbierto.set(true);
  }

  protected cambiarTipo(tipo: TipoMovimiento): void {
    this.abrirFormulario(tipo);
  }

  /** "Trasladar" desde la fila: el menor y el tipo ya quedan elegidos; falta el destino y la fecha. */
  protected trasladar(a: Asignacion): void {
    this.abrirFormulario('traslado', a.menor_id);
  }

  protected hogarActualDe(menorId: string): string | null {
    return this.vigentes().find((a) => a.menor_id === menorId)?.hogar_id ?? null;
  }

  protected fecha(iso: string): string {
    const f = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(f.getTime())) return iso;
    return f.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private async cargarFiltros(): Promise<void> {
    this.cargandoFiltros.set(true);
    const api = this.config.apiUrl;
    const peticiones: Promise<unknown>[] = [
      firstValueFrom(this.http.get<Menor[]>(`${api}/menores`)).then((m) => this.menores.set(m)),
    ];
    if (this.puedeVerHogaresYZonas()) {
      peticiones.push(
        firstValueFrom(this.http.get<Zona[]>(`${api}/zonas-hogares/zonas`)).then((z) => this.zonas.set(z)),
        firstValueFrom(this.http.get<Hogar[]>(`${api}/zonas-hogares/hogares`)).then((h) => this.hogares.set(h)),
        firstValueFrom(this.http.get<Madre[]>(`${api}/madres`)).then((m) => this.madres.set(m)),
      );
    }
    // Cada lista falla por su cuenta: sin una de ellas se sigue pudiendo filtrar y registrar.
    await Promise.allSettled(peticiones);
    await this.cargarVigentes();
    this.cargandoFiltros.set(false);
  }

  private async cargarVigentes(): Promise<void> {
    try {
      this.vigentes.set(
        await firstValueFrom(this.http.get<Asignacion[]>(`${this.config.apiUrl}/asignaciones`, { params: { estado_actual: 'vigente' } })),
      );
    } catch {
      this.vigentes.set([]);
    }
  }

  protected etiquetaMovimiento(tipo: string | null | undefined): string {
    return ({ ingreso: 'Ingreso', traslado: 'Traslado', egreso: 'Egreso' } as Record<string, string>)[tipo ?? ''] ?? tipo ?? '';
  }

  /** "Hogar de <madre> · <zona>": distingue hogares de la misma zona por el nombre de la madre. */
  protected etiquetaHogar(h: Hogar): string {
    const madre = this.madres().find((m) => m.id === h.madre_id);
    const zona = this.zonas().find((z) => z.id === h.zona_id)?.nombre;
    const nombre = madre ? `Hogar de ${madre.nombres} ${madre.apellidos}` : 'Hogar sin madre asignada';
    return zona && this.esAdmin() ? `${nombre} · ${zona}` : nombre;
  }

  protected nombreMenor(menorId: string): string {
    const m = this.menores().find((x) => x.id === menorId);
    return m ? `${m.nombres} ${m.apellidos}` : 'Menor';
  }

  protected etiquetaHogarPorId(hogarId: string): string {
    const h = this.hogares().find((x) => x.id === hogarId);
    return h ? this.etiquetaHogar(h) : `Hogar ${hogarId.slice(0, 8)}`;
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = {};
      if (this.soloVigentes()) params['estado_actual'] = 'vigente';
      if (this.filtroMenorId) params['menor_id'] = this.filtroMenorId;
      if (this.filtroHogarId) params['hogar_id'] = this.filtroHogarId;
      if (this.filtroZonaId) params['zona_id'] = this.filtroZonaId;
      this.asignaciones.set(await firstValueFrom(this.http.get<Asignacion[]>(`${this.config.apiUrl}/asignaciones`, { params })));
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
      await firstValueFrom(
        this.http.post<Asignacion>(`${this.config.apiUrl}/asignaciones`, {
          menor_id: this.nueva.menor_id,
          hogar_id: this.nueva.hogar_id,
          fecha_inicio: this.nueva.fecha_inicio,
          tipo_movimiento: this.nueva.tipo_movimiento,
          acta_referencia: this.nueva.acta_referencia.trim() || null,
          motivo: this.nueva.motivo.trim() || null,
        }),
      );
      this.formularioAbierto.set(false);
      // Un traslado también cierra la asignación anterior: se recargan ambas listas.
      await Promise.all([this.cargar(), this.cargarVigentes()]);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected iniciarEgreso(a: Asignacion): void {
    this.formularioAbierto.set(false);
    this.egreso = { fecha_fin: hoy(), motivo: '', otro: '', acta_referencia: '' };
    this.egresoId.set(a.id);
  }

  protected async confirmarEgreso(a: Asignacion): Promise<void> {
    this.guardandoEgreso.set(true);
    this.error.set('');
    const motivo = this.egreso.motivo === 'Otro' ? `Otro: ${this.egreso.otro.trim()}` : this.egreso.motivo;
    try {
      await firstValueFrom(
        this.http.put<Asignacion>(`${this.config.apiUrl}/asignaciones/${a.id}/cerrar`, {
          fecha_fin: this.egreso.fecha_fin,
          motivo,
          acta_referencia: this.egreso.acta_referencia.trim() || null,
        }),
      );
      this.egresoId.set(null);
      await Promise.all([this.cargar(), this.cargarVigentes()]);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoEgreso.set(false);
    }
  }

  protected async verHistorial(a: Asignacion): Promise<void> {
    if (this.historialSeleccionadoId() === a.id) {
      this.historialSeleccionadoId.set(null);
      return;
    }
    this.historialSeleccionadoId.set(a.id);
    try {
      this.historial.set(await firstValueFrom(this.http.get<AsignacionHistoria[]>(`${this.config.apiUrl}/asignaciones/${a.id}/historial`)));
    } catch {
      this.error.set(MENSAJE_GENERICO);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para realizar esta acción.';
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
