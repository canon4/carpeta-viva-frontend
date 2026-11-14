import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type GrupoCatalogo = components['schemas']['GrupoCatalogoOut'];
type OpcionAdmin = components['schemas']['CatalogoOpcionAdminOut'];
type Parametro = components['schemas']['ParametroOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Conjunto cerrado de secciones sensibles (ADR-0013 sección 5.1, `SECCIONES_VALIDAS` en el
 * backend). "Básica" (cadena vacía, se envía como `null`) significa explícitamente sin sección
 * sensible asociada: es una opción más de la lista, no un valor por defecto implícito.
 */
const SECCIONES: { valor: string; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Básica (sin sección sensible)' },
  { valor: 'familia', etiqueta: 'Familia' },
  { valor: 'salud', etiqueta: 'Salud' },
  { valor: 'psicosocial', etiqueta: 'Psicosocial' },
];

/** Sentinela que marca "todavía no elige nada": nunca se envía al backend. */
const SIN_ELEGIR = '__sin_elegir__';

function etiquetaSeccion(valor: string | null | undefined): string {
  if (!valor) return 'Básica (sin sección sensible)';
  return SECCIONES.find((s) => s.valor === valor)?.etiqueta ?? valor;
}

/**
 * Pantalla de administración de catálogos y parámetros (ADR-0013, módulo transversal T4). Solo
 * rol `admin`. Dos pestañas: catálogos de opciones y parámetros de negocio.
 */
@Component({
  selector: 'app-configuracion',
  imports: [FormsModule],
  template: `
    <h1>Configuración</h1>
    <p class="nota">
      Catálogos y parámetros que puede cambiar sin pedir ayuda al equipo de desarrollo. Los
      cambios se aplican de inmediato, sin reinstalar la aplicación.
    </p>

    <div class="formulario" style="grid-auto-flow: column; justify-content: start">
      <button type="button" [disabled]="pestana() === 'catalogos'" (click)="cambiarPestana('catalogos')">
        Catálogos
      </button>
      <button type="button" [disabled]="pestana() === 'parametros'" (click)="cambiarPestana('parametros')">
        Parámetros
      </button>
    </div>

    @if (pestana() === 'catalogos') {
      <section class="tarjeta">
        <h2>Grupos de catálogo</h2>
        @if (cargandoGrupos()) {
          <p class="nota">Cargando grupos...</p>
        }
        @if (errorGrupos()) {
          <p class="error" role="alert">{{ errorGrupos() }}</p>
        }
        <ul class="lista-simple">
          @for (g of grupos(); track g.grupo) {
            <li>
              <button type="button" class="tarjeta" [class.activo]="grupoSeleccionado()?.grupo === g.grupo" (click)="seleccionarGrupo(g)">
                <strong>{{ g.etiqueta }}</strong>
                <p class="nota">{{ g.descripcion }}</p>
                <p class="nota">
                  {{ g.total_opciones_activas }} opción(es) activa(s)
                  @if (g.con_seccion_acceso) {
                    — exige elegir sección de acceso al crear
                  }
                </p>
              </button>
            </li>
          }
        </ul>
      </section>

      @if (grupoSeleccionado()) {
        <section class="tarjeta">
          <h2>Opciones de «{{ grupoSeleccionado()!.etiqueta }}»</h2>

          @if (cargandoOpciones()) {
            <p class="nota">Cargando opciones...</p>
          }
          @if (errorOpciones()) {
            <p class="error" role="alert">{{ errorOpciones() }}</p>
          }

          <div style="overflow-x:auto">
            <table class="tabla">
              <thead>
                <tr>
                  <th scope="col">Valor</th>
                  <th scope="col">Etiqueta</th>
                  <th scope="col">Orden</th>
                  @if (grupoSeleccionado()!.con_seccion_acceso) {
                    <th scope="col">Sección de acceso</th>
                  }
                  <th scope="col">Activo</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                @for (op of opciones(); track op.id) {
                  <tr>
                    <td>{{ op.valor }}</td>
                    <td>
                      <input [name]="'etiqueta-' + op.id" [(ngModel)]="edicionEtiqueta[op.id]" [attr.aria-label]="'Etiqueta de ' + op.valor" />
                    </td>
                    <td>
                      <input
                        type="number"
                        [name]="'orden-' + op.id"
                        [(ngModel)]="edicionOrden[op.id]"
                        [attr.aria-label]="'Orden de ' + op.valor"
                        style="width: 5rem"
                      />
                    </td>
                    @if (grupoSeleccionado()!.con_seccion_acceso) {
                      <td>{{ etiquetaSeccion(op.seccion_acceso) }}</td>
                    }
                    <td>
                      <label [attr.for]="'activo-' + op.id">
                        <input type="checkbox" [id]="'activo-' + op.id" [name]="'activo-' + op.id" [(ngModel)]="edicionActivo[op.id]" />
                        Activo
                      </label>
                    </td>
                    <td>
                      <button type="button" (click)="guardarOpcion(op)" [disabled]="guardandoId() === op.id">
                        {{ guardandoId() === op.id ? 'Guardando...' : 'Guardar' }}
                      </button>
                    </td>
                  </tr>
                }
                @if (!cargandoOpciones() && opciones().length === 0) {
                  <tr>
                    <td [attr.colspan]="grupoSeleccionado()!.con_seccion_acceso ? 6 : 5">
                      Este grupo todavía no tiene opciones.
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <form class="formulario" (ngSubmit)="crearOpcion()" #fo="ngForm">
            <h3>Nueva opción</h3>
            <label for="nValor">Valor (clave estable, sin espacios)</label>
            <input id="nValor" name="nValor" required [(ngModel)]="nuevoValor" />

            <label for="nEtiqueta">Etiqueta (texto mostrado en pantalla)</label>
            <input id="nEtiqueta" name="nEtiqueta" required [(ngModel)]="nuevaEtiqueta" />

            <label for="nOrden">Orden</label>
            <input id="nOrden" name="nOrden" type="number" [(ngModel)]="nuevoOrden" />

            @if (grupoSeleccionado()!.con_seccion_acceso) {
              <label for="nSeccion">Sección de acceso (obligatorio)</label>
              <select id="nSeccion" name="nSeccion" required [(ngModel)]="nuevaSeccion">
                <option [value]="SIN_ELEGIR" disabled>Seleccione una sección</option>
                @for (s of SECCIONES; track s.valor) {
                  <option [value]="s.valor">{{ s.etiqueta }}</option>
                }
              </select>
              <p class="nota">
                Una vez creada la opción, la sección no se puede cambiar: si quedó mal clasificada,
                desactívela y cree una opción nueva con la sección correcta.
              </p>
            }

            @if (errorCrear()) {
              <p class="error" role="alert">{{ errorCrear() }}</p>
            }

            <button type="submit" [disabled]="fo.invalid || !puedeCrear() || creando()">
              {{ creando() ? 'Creando...' : 'Crear opción' }}
            </button>
          </form>
        </section>
      }
    }

    @if (pestana() === 'parametros') {
      <section class="tarjeta">
        <h2>Parámetros de negocio</h2>
        @if (cargandoParametros()) {
          <p class="nota">Cargando parámetros...</p>
        }
        @if (errorParametros()) {
          <p class="error" role="alert">{{ errorParametros() }}</p>
        }

        <ul class="lista-simple">
          @for (p of parametros(); track p.clave) {
            <li class="tarjeta">
              <p><strong>{{ p.etiqueta }}</strong> ({{ p.clave }})</p>
              <p class="nota">{{ p.descripcion }}</p>
              <p class="nota">
                Tipo: {{ p.tipo }} — {{ p.publico ? 'Pública' : 'Solo administración' }}
                @if (!p.editado_por_admin) {
                  — usando valor por defecto
                }
              </p>
              <p class="nota">Valor por defecto: {{ p.valor_por_defecto }}</p>

              <form class="formulario" (ngSubmit)="guardarParametro(p)" style="grid-auto-flow: column; align-items: end">
                <div>
                  <label [for]="'valor-' + p.clave">Valor actual</label>
                  <input [id]="'valor-' + p.clave" [name]="'valor-' + p.clave" [(ngModel)]="edicionValor[p.clave]" />
                </div>
                <button type="submit" [disabled]="guardandoParametro() === p.clave">
                  {{ guardandoParametro() === p.clave ? 'Guardando...' : 'Guardar' }}
                </button>
              </form>
            </li>
          }
          @if (!cargandoParametros() && parametros().length === 0) {
            <p class="nota">No hay parámetros registrados.</p>
          }
        </ul>
      </section>
    }
  `,
  styles: [`
    button.tarjeta { text-align: left; cursor: pointer; border: 1px solid var(--color-borde, #d1dedb); background: none; width: 100%; }
    button.tarjeta.activo { border-color: #18A999; background: #E3F5F1; }
  `],
})
export class Configuracion {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly SECCIONES = SECCIONES;
  protected readonly SIN_ELEGIR = SIN_ELEGIR;
  protected readonly etiquetaSeccion = etiquetaSeccion;

  protected readonly pestana = signal<'catalogos' | 'parametros'>('catalogos');

  protected readonly grupos = signal<GrupoCatalogo[]>([]);
  protected readonly cargandoGrupos = signal(false);
  protected readonly errorGrupos = signal('');

  protected readonly grupoSeleccionado = signal<GrupoCatalogo | null>(null);
  protected readonly opciones = signal<OpcionAdmin[]>([]);
  protected readonly cargandoOpciones = signal(false);
  protected readonly errorOpciones = signal('');
  protected readonly guardandoId = signal<string | null>(null);

  protected readonly edicionEtiqueta: Record<string, string> = {};
  protected readonly edicionOrden: Record<string, number> = {};
  protected readonly edicionActivo: Record<string, boolean> = {};

  protected nuevoValor = '';
  protected nuevaEtiqueta = '';
  protected nuevoOrden = 0;
  protected nuevaSeccion: string = SIN_ELEGIR;
  protected readonly creando = signal(false);
  protected readonly errorCrear = signal('');

  // No es un computed(): depende de `nuevaSeccion`, una propiedad de clase normal que cambia
  // por el [(ngModel)] del <select>, no por una signal. Un computed() solo volvería a evaluar
  // cuando cambia una signal que lee (aquí, grupoSeleccionado), así que quedaría deshabilitado
  // para siempre tras elegir la sección. Angular vuelve a llamar este método en cada ciclo de
  // detección de cambios, igual que llamaría a un computed().
  protected puedeCrear(): boolean {
    const g = this.grupoSeleccionado();
    if (!g) return false;
    if (g.con_seccion_acceso && this.nuevaSeccion === SIN_ELEGIR) return false;
    return true;
  }

  protected readonly parametros = signal<Parametro[]>([]);
  protected readonly cargandoParametros = signal(false);
  protected readonly errorParametros = signal('');
  protected readonly guardandoParametro = signal<string | null>(null);
  protected readonly edicionValor: Record<string, string> = {};

  constructor() {
    void this.cargarGrupos();
    void this.cargarParametros();
  }

  protected cambiarPestana(p: 'catalogos' | 'parametros'): void {
    this.pestana.set(p);
  }

  private async cargarGrupos(): Promise<void> {
    this.cargandoGrupos.set(true);
    this.errorGrupos.set('');
    try {
      this.grupos.set(
        await firstValueFrom(this.http.get<GrupoCatalogo[]>(`${this.config.apiUrl}/configuracion/catalogos`)),
      );
    } catch {
      this.errorGrupos.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoGrupos.set(false);
    }
  }

  protected seleccionarGrupo(g: GrupoCatalogo): void {
    this.grupoSeleccionado.set(g);
    this.nuevoValor = '';
    this.nuevaEtiqueta = '';
    this.nuevoOrden = 0;
    this.nuevaSeccion = SIN_ELEGIR;
    this.errorCrear.set('');
    void this.cargarOpciones(g.grupo);
  }

  private async cargarOpciones(grupo: string): Promise<void> {
    this.cargandoOpciones.set(true);
    this.errorOpciones.set('');
    try {
      const opciones = await firstValueFrom(
        this.http.get<OpcionAdmin[]>(`${this.config.apiUrl}/configuracion/catalogos/${grupo}/admin`),
      );
      this.opciones.set(opciones);
      for (const op of opciones) {
        this.edicionEtiqueta[op.id] = op.etiqueta;
        this.edicionOrden[op.id] = op.orden;
        this.edicionActivo[op.id] = op.activo;
      }
    } catch {
      this.errorOpciones.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoOpciones.set(false);
    }
  }

  protected async guardarOpcion(op: OpcionAdmin): Promise<void> {
    const g = this.grupoSeleccionado();
    if (!g) return;
    this.guardandoId.set(op.id);
    this.errorOpciones.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<OpcionAdmin>(`${this.config.apiUrl}/configuracion/catalogos/${g.grupo}/${op.valor}`, {
          etiqueta: this.edicionEtiqueta[op.id],
          orden: this.edicionOrden[op.id],
          activo: this.edicionActivo[op.id],
        }),
      );
      this.opciones.set(this.opciones().map((o) => (o.id === actualizada.id ? actualizada : o)));
    } catch (error) {
      this.errorOpciones.set(this.mensajeError(error));
    } finally {
      this.guardandoId.set(null);
    }
  }

  protected async crearOpcion(): Promise<void> {
    const g = this.grupoSeleccionado();
    if (!g || !this.puedeCrear()) return;
    this.creando.set(true);
    this.errorCrear.set('');
    try {
      const cuerpo: { valor: string; etiqueta: string; orden: number; seccion_acceso?: string | null } = {
        valor: this.nuevoValor.trim(),
        etiqueta: this.nuevaEtiqueta.trim(),
        orden: this.nuevoOrden,
      };
      if (g.con_seccion_acceso) {
        cuerpo.seccion_acceso = this.nuevaSeccion === '' ? null : this.nuevaSeccion;
      }
      const creada = await firstValueFrom(
        this.http.post<OpcionAdmin>(`${this.config.apiUrl}/configuracion/catalogos/${g.grupo}`, cuerpo),
      );
      this.opciones.set([...this.opciones(), creada]);
      this.edicionEtiqueta[creada.id] = creada.etiqueta;
      this.edicionOrden[creada.id] = creada.orden;
      this.edicionActivo[creada.id] = creada.activo;
      this.grupos.set(
        this.grupos().map((x) => (x.grupo === g.grupo ? { ...x, total_opciones_activas: x.total_opciones_activas + 1 } : x)),
      );
      this.nuevoValor = '';
      this.nuevaEtiqueta = '';
      this.nuevoOrden = 0;
      this.nuevaSeccion = SIN_ELEGIR;
    } catch (error) {
      this.errorCrear.set(this.mensajeError(error));
    } finally {
      this.creando.set(false);
    }
  }

  private async cargarParametros(): Promise<void> {
    this.cargandoParametros.set(true);
    this.errorParametros.set('');
    try {
      const parametros = await firstValueFrom(
        this.http.get<Parametro[]>(`${this.config.apiUrl}/configuracion/parametros`),
      );
      this.parametros.set(parametros);
      for (const p of parametros) {
        this.edicionValor[p.clave] = p.valor_actual;
      }
    } catch {
      this.errorParametros.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoParametros.set(false);
    }
  }

  protected async guardarParametro(p: Parametro): Promise<void> {
    this.guardandoParametro.set(p.clave);
    this.errorParametros.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Parametro>(`${this.config.apiUrl}/configuracion/parametros/${p.clave}`, {
          valor: this.edicionValor[p.clave],
        }),
      );
      this.parametros.set(this.parametros().map((x) => (x.clave === actualizado.clave ? actualizado : x)));
    } catch (error) {
      this.errorParametros.set(this.mensajeError(error));
    } finally {
      this.guardandoParametro.set(null);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta acción.';
      if (error.status === 400) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'La solicitud no es válida.';
      }
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
