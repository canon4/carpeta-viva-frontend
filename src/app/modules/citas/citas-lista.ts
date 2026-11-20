import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import { SelectorMenor } from '../../shared/selector-menor/selector-menor';
import type { components } from '../../core/api/schema';

// El generador de tipos distingue este `CitaOut` (citas y recordatorios) del homónimo agregado
// en el módulo `ia` (cita a una fuente documental, Fase 5) porque ambos backends usan el mismo
// nombre de clase en módulos distintos.
type Cita = components['schemas']['app__modules__citas__schemas__CitaOut'];
type Menor = components['schemas']['MenorOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

const ETIQUETAS_TIPO: Record<string, string> = {
  medica: 'Médica',
  psicosocial: 'Psicosocial',
  reunion_familia: 'Reunión con familia biológica',
  otro: 'Otro',
};

const ETIQUETAS_ESTADO: Record<string, string> = {
  pendiente: 'Pendiente',
  cumplida: 'Cumplida',
  no_asistio: 'No asistió',
};

/**
 * Citas y Recordatorios de un menor: el sistema no asigna citas, solo las recuerda (RF15).
 * El campo `notas` puede llegar `null` cuando el backend determina que el usuario no tiene
 * permiso de sección para el tipo de esa cita (ADR-0009, sección 2): se muestra un mensaje
 * explícito, nunca un campo vacío ambiguo.
 */
@Component({
  selector: 'app-citas-lista',
  imports: [FormsModule, SelectorMenor],
  template: `
    <div class="encabezado-modulo">
      <h1>Citas y recordatorios</h1>
      @if (tiposPermitidos().length > 0 && !formularioAbierto()) {
        <button type="button" (click)="abrirFormulario()">Registrar cita</button>
      }
    </div>

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="registrar()" #f="ngForm" aria-labelledby="tituloCita">
        <h2 id="tituloCita">Registrar cita</h2>
        <div class="campos">
          <div class="campo">
            <app-selector-menor etiqueta="Menor *" [(valor)]="nueva.menor_id" [requerido]="true" />
          </div>
          @if (tiposPermitidos().length > 1) {
            <div class="campo">
              <label for="nTipo">Tipo de cita *</label>
              <select id="nTipo" name="nTipo" required [(ngModel)]="nueva.tipo">
                @for (t of tiposPermitidos(); track t) {
                  <option [value]="t">{{ etiquetaTipo(t) }}</option>
                }
              </select>
            </div>
          } @else {
            <div class="campo">
              <span>Tipo de cita</span>
              <strong>{{ etiquetaTipo(tiposPermitidos()[0]) }}</strong>
            </div>
          }
          <div class="campo">
            <label for="nFechaHora">Fecha y hora *</label>
            <input id="nFechaHora" name="nFechaHora" type="datetime-local" required [(ngModel)]="nueva.fecha_hora" />
          </div>
          <div class="campo">
            <label for="nLugar">Lugar</label>
            <input id="nLugar" name="nLugar" autocomplete="off" [(ngModel)]="nueva.lugar" />
          </div>
          <div class="campo">
            <label for="nNotas">Notas de logística</label>
            <input id="nNotas" name="nNotas" autocomplete="off" placeholder="Ej.: traer carné de vacunas" [(ngModel)]="nueva.notas" />
          </div>
        </div>
        <p class="nota">Las notas son solo para logística. El contenido clínico o psicosocial va en Gestión documental.</p>
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
          <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
        </div>
      </form>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="filtros">
      <div class="campo">
        <label for="fVista">Mostrar</label>
        <select id="fVista" [ngModel]="soloProximas()" (ngModelChange)="soloProximas.set($event); filtrar()">
          <option [ngValue]="true">Próximas citas</option>
          <option [ngValue]="false">Todas</option>
        </select>
      </div>
      @if (!soloProximas()) {
        <div class="campo">
          <app-selector-menor etiqueta="Menor" opcionVacia="Todos los menores" [valor]="filtroMenorId" (valorChange)="filtroMenorId = $event; filtrar()" />
        </div>
        <div class="campo">
          <label for="fTipo">Tipo</label>
          <select id="fTipo" [ngModel]="filtroTipo" (ngModelChange)="filtroTipo = $event; filtrar()">
            <option value="">Todos</option>
            @for (t of todosLosTipos; track t) {
              <option [value]="t">{{ etiquetaTipo(t) }}</option>
            }
          </select>
        </div>
        <div class="campo">
          <label for="fEstado">Estado</label>
          <select id="fEstado" [ngModel]="filtroEstado" (ngModelChange)="filtroEstado = $event; filtrar()">
            <option value="">Todos</option>
            <option value="pendiente">Pendiente</option>
            <option value="cumplida">Cumplida</option>
            <option value="no_asistio">No asistió</option>
          </select>
        </div>
      }
    </div>

    @if (cargando()) {
      <p class="nota" role="status">Cargando citas...</p>
    } @else if (citas().length === 0) {
      <p class="nota">{{ soloProximas() ? 'No hay citas próximas.' : 'No hay citas para mostrar con estos filtros.' }}</p>
    } @else {
      <table class="tabla-datos" aria-label="Citas">
        <thead>
          <tr>
            <th scope="col">Fecha y hora</th>
            <th scope="col">Menor</th>
            <th scope="col">Tipo</th>
            <th scope="col">Lugar y notas</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (c of citas(); track c.id) {
            <tr>
              <td data-etiqueta="Fecha y hora">{{ fechaLegible(c.fecha_hora) }}</td>
              <td data-etiqueta="Menor">{{ nombreMenor(c.menor_id) }}</td>
              <td data-etiqueta="Tipo">{{ etiquetaTipo(c.tipo) }}</td>
              <td data-etiqueta="Lugar y notas">
                {{ c.lugar || 'Sin lugar' }}
                <br /><span class="nota">{{ c.notas === null ? 'Sin acceso a las notas' : (c.notas || 'Sin notas') }}</span>
              </td>
              <td data-etiqueta="Estado">
                @if (c.estado === 'pendiente' && puedeGestionarCita(c)) {
                  <div class="acciones-fila">
                    <button type="button" (click)="cambiarEstado(c, 'cumplida')" [disabled]="guardandoId() === c.id">Cumplida</button>
                    <button type="button" class="boton-secundario" (click)="cambiarEstado(c, 'no_asistio')" [disabled]="guardandoId() === c.id">No asistió</button>
                  </div>
                } @else {
                  <span [class]="'estado estado-cita-' + c.estado">{{ etiquetaEstado(c.estado) }}</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class CitasLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly esMadreOAdmin = computed(() => this.auth.rol() === 'madre' || this.auth.rol() === 'admin');
  protected readonly esDefensorOAdmin = computed(() => this.auth.rol() === 'defensor' || this.auth.rol() === 'admin');

  protected readonly etiquetaTipo = (t: string) => ETIQUETAS_TIPO[t] ?? t;
  protected readonly etiquetaEstado = (e: string) => ETIQUETAS_ESTADO[e] ?? e;

  /** Dueño de la cita según su tipo (ADR-0015 sección 2): madre para medica/psicosocial/otro, defensor para reunion_familia. */
  protected puedeGestionarCita(c: Cita): boolean {
    return c.tipo === 'reunion_familia' ? this.esDefensorOAdmin() : this.esMadreOAdmin();
  }

  protected readonly citas = signal<Cita[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly guardandoId = signal<string | null>(null);
  protected readonly formularioAbierto = signal(false);
  protected readonly soloProximas = signal(true);
  private readonly nombres = signal<Record<string, string>>({});

  protected filtroMenorId = '';
  protected filtroTipo = '';
  protected filtroEstado = '';

  protected readonly todosLosTipos = Object.keys(ETIQUETAS_TIPO);
  /** Un solo formulario: el rol decide qué tipos puede registrar (ADR-0015, un dueño por tipo). */
  protected readonly tiposPermitidos = computed(() => {
    const rol = this.auth.rol();
    if (rol === 'admin') return this.todosLosTipos;
    if (rol === 'madre') return ['medica', 'psicosocial', 'otro'];
    if (rol === 'defensor') return ['reunion_familia'];
    return [];
  });

  protected nueva = { menor_id: '', tipo: '', fecha_hora: '', lugar: '', notas: '' };

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    if (this.filtroMenorId) {
      this.soloProximas.set(false);
      this.nueva.menor_id = this.filtroMenorId;
    }
    if (this.route.snapshot.queryParamMap.get('nuevo') === '1' && this.tiposPermitidos().length > 0) this.abrirFormulario();
    void this.cargar();
    void this.cargarNombres();
  }

  protected abrirFormulario(): void {
    this.nueva.tipo = this.tiposPermitidos()[0] ?? '';
    this.formularioAbierto.set(true);
  }

  protected nombreMenor(id: string): string {
    return this.nombres()[id] ?? 'Menor';
  }

  protected fechaLegible(iso: string): string {
    const fecha = new Date(iso);
    if (Number.isNaN(fecha.getTime())) return iso;
    return fecha.toLocaleString('es-CO', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  private async cargarNombres(): Promise<void> {
    try {
      const menores = await firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`));
      this.nombres.set(Object.fromEntries(menores.map((m) => [m.id, `${m.nombres} ${m.apellidos}`])));
    } catch {
      /* sin nombres se muestra "Menor" */
    }
  }

  protected filtrar(): void {
    void this.cargar();
  }

  protected async registrar(): Promise<void> {
    const exito = await this.crear({ ...this.nueva, tipo: this.nueva.tipo || this.tiposPermitidos()[0] });
    if (exito) {
      this.nueva = { menor_id: this.nueva.menor_id, tipo: '', fecha_hora: '', lugar: '', notas: '' };
      this.formularioAbierto.set(false);
    }
  }

  private async cargar(): Promise<void> {
    const proximas = this.soloProximas();
    this.cargando.set(true);
    this.error.set('');
    try {
      if (proximas) {
        this.citas.set(await firstValueFrom(this.http.get<Cita[]>(`${this.config.apiUrl}/citas/proximas`)));
      } else {
        const params: Record<string, string> = {};
        if (this.filtroMenorId.trim()) params['menor_id'] = this.filtroMenorId.trim();
        if (this.filtroTipo) params['tipo'] = this.filtroTipo;
        if (this.filtroEstado) params['estado'] = this.filtroEstado;
        this.citas.set(await firstValueFrom(this.http.get<Cita[]>(`${this.config.apiUrl}/citas`, { params })));
      }
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  private async crear(datos: {
    menor_id: string;
    tipo: string;
    fecha_hora: string;
    lugar: string;
    notas: string;
  }): Promise<boolean> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const fechaIso = datos.fecha_hora ? new Date(datos.fecha_hora).toISOString() : '';
      const creada = await firstValueFrom(
        this.http.post<Cita>(`${this.config.apiUrl}/citas`, {
          menor_id: datos.menor_id,
          tipo: datos.tipo,
          fecha_hora: fechaIso,
          lugar: datos.lugar || null,
          notas: datos.notas || null,
        }),
      );
      this.citas.set([creada, ...this.citas()]);
      return true;
    } catch (e) {
      this.error.set(this.mensajeError(e));
      return false;
    } finally {
      this.guardando.set(false);
    }
  }

  protected async cambiarEstado(c: Cita, estado: 'cumplida' | 'no_asistio'): Promise<void> {
    this.guardandoId.set(c.id);
    this.error.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Cita>(`${this.config.apiUrl}/citas/${c.id}/estado`, { estado }),
      );
      this.citas.set(this.citas().map((x) => (x.id === actualizada.id ? actualizada : x)));
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta acción.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
