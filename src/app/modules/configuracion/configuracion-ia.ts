import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type ConfigIa = components['schemas']['IaConfiguracionOut'];
type Prueba = components['schemas']['IaPruebaOut'];
type Reindexado = components['schemas']['ReindexarPendientesOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

type Modelos = components['schemas']['IaModelosOut'];

// Sin listas de modelos escritas a mano: los modelos se consultan al proveedor con la clave
// guardada (GET /ia/configuracion/modelos), así nunca se ofrece uno inexistente o sin acceso.
const PROVEEDORES: Record<string, { etiqueta: string; ayuda: string }> = {
  anthropic: { etiqueta: 'Anthropic (Claude)', ayuda: 'La clave empieza por "sk-ant-". Se crea en la consola de Anthropic.' },
  groq: { etiqueta: 'Groq', ayuda: 'La clave empieza por "gsk_". Se crea en la consola de Groq.' },
};

/**
 * Proveedor, modelo y clave de API del asistente (ADR-0017). La clave es de solo escritura: se
 * envía una vez, el backend la guarda cifrada y aquí solo se ve si existe y sus últimos 4 caracteres.
 */
@Component({
  selector: 'app-configuracion-ia',
  imports: [FormsModule],
  template: `
    @if (cargando()) {
      <p class="nota" role="status">Cargando configuración del asistente...</p>
    } @else if (actual(); as c) {
      <section class="panel-formulario" aria-labelledby="tituloEstadoIa">
        <h2 id="tituloEstadoIa">Estado</h2>
        <dl class="datos">
          <dt>Proveedor</dt>
          <dd>{{ etiquetaProveedor(c.proveedor) }} · {{ c.modelo }}</dd>
          <dt>Clave de API</dt>
          <dd>
            @switch (c.clave_origen) {
              @case ('panel') { <span class="estado estado-activo">Configurada</span> termina en ····{{ c.clave_sufijo }} }
              @case ('entorno') { <span class="estado estado-activo">Configurada en el servidor</span> }
              @default { <span class="estado estado-evadido">Sin clave</span> el asistente no puede responder }
            }
          </dd>
          @if (c.actualizado_en) {
            <dt>Último cambio</dt>
            <dd>{{ fecha(c.actualizado_en) }}</dd>
          }
        </dl>
        <div class="acciones">
          <button type="button" class="boton-secundario" (click)="probar()" [disabled]="probando()">{{ probando() ? 'Probando...' : 'Probar conexión' }}</button>
        </div>
        @if (prueba(); as p) {
          <p [class]="p.ok ? 'exito' : 'error'" role="status">{{ p.mensaje }}</p>
        }
      </section>

      <form class="panel-formulario" (ngSubmit)="guardar()" #f="ngForm" aria-labelledby="tituloCambiarIa">
        <h2 id="tituloCambiarIa">Cambiar proveedor o clave</h2>
        <div class="campos">
          <div class="campo">
            <label for="proveedor">Proveedor *</label>
            <select id="proveedor" name="proveedor" required [(ngModel)]="proveedor" (ngModelChange)="cambiarProveedor()">
              @for (p of c.proveedores_disponibles; track p) {
                <option [value]="p">{{ etiquetaProveedor(p) }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="modelo">Modelo *</label>
            @if (modelos().length > 0) {
              <select id="modelo" name="modelo" required [(ngModel)]="modelo">
                @if (!modelos().includes(modelo)) {
                  <option [value]="modelo" disabled>{{ modelo ? modelo + ' (no disponible)' : 'Seleccione un modelo' }}</option>
                }
                @for (m of modelos(); track m) {
                  <option [value]="m">{{ m }}</option>
                }
              </select>
              <span class="nota">{{ modelos().length }} modelos disponibles en su cuenta.</span>
            } @else {
              <input id="modelo" name="modelo" required autocomplete="off" spellcheck="false" [(ngModel)]="modelo" />
              <span class="nota">
                @if (cargandoModelos()) {
                  Consultando modelos de su cuenta...
                } @else if (errorModelos()) {
                  No se pudo consultar la lista ({{ errorModelos() }}). Guarde primero una clave válida o escriba el nombre exacto.
                }
              </span>
            }
            <button type="button" class="boton-secundario boton-chico" (click)="cargarModelos()" [disabled]="cargandoModelos()">Actualizar lista</button>
          </div>
          <div class="campo">
            <label for="apiKey">Nueva clave de API</label>
            <input id="apiKey" name="apiKey" type="password" autocomplete="new-password" spellcheck="false" [(ngModel)]="apiKey" />
            <span class="nota">{{ ayudaDe(proveedor) }} Déjela vacía para conservar la actual.</span>
          </div>
        </div>
        @if (proveedor !== c.proveedor && !apiKey && c.clave_origen === 'panel') {
          <p class="nota">Al cambiar de proveedor sin escribir una clave nueva, la clave guardada se descarta.</p>
        }
        <p class="nota">La clave se guarda cifrada y nunca se vuelve a mostrar. Solo el administrador puede cambiarla y cada cambio queda en la auditoría.</p>
        @if (errorGuardar()) {
          <p class="error" role="alert">{{ errorGuardar() }}</p>
        }
        @if (exito()) {
          <p class="exito" role="status">{{ exito() }}</p>
        }
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
          @if (c.clave_origen === 'panel') {
            <button type="button" class="boton-secundario" (click)="borrarClave()" [disabled]="guardando()">Borrar clave guardada</button>
          }
        </div>
      </form>

      <section class="panel-formulario" aria-labelledby="tituloIndice">
        <h2 id="tituloIndice">Índice de búsqueda</h2>
        <p class="nota">
          El asistente solo encuentra lo que está indexado. Si responde que no encontró información sobre
          documentos que sí existen, reindexe los pendientes.
        </p>
        <div class="acciones">
          <button type="button" class="boton-secundario" (click)="reindexar()" [disabled]="reindexando()">{{ reindexando() ? 'Reindexando...' : 'Reindexar documentos pendientes' }}</button>
        </div>
        @if (reindexado(); as r) {
          <p class="exito" role="status">
            Se indexaron {{ r.documentos_reindexados }} documentos y {{ r.reportes_reindexados }} informes.
            @if (r.documentos_con_error.length + r.reportes_con_error.length > 0) {
              <span class="error">{{ r.documentos_con_error.length + r.reportes_con_error.length }} no se pudieron leer.</span>
            }
          </p>
        }
      </section>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
  `,
  styles: [`
    .panel-formulario { max-width: 52rem; }
    .datos { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 0 0 1rem; }
    .datos dt { font-weight: 600; color: #3e4c59; }
    .datos dd { margin: 0; }
    .campos { align-items: start; }
    .boton-chico { justify-self: start; margin-top: 0.35rem; padding: 0.3rem 0.75rem; font-size: 0.9rem; }
  `],
})
export class ConfiguracionIa {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly url = `${this.config.apiUrl}/ia/configuracion`;

  protected readonly actual = signal<ConfigIa | null>(null);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);
  protected readonly errorGuardar = signal('');
  protected readonly exito = signal('');
  protected readonly probando = signal(false);
  protected readonly prueba = signal<Prueba | null>(null);
  protected readonly reindexando = signal(false);
  protected readonly reindexado = signal<Reindexado | null>(null);
  protected readonly modelos = signal<string[]>([]);
  protected readonly cargandoModelos = signal(false);
  protected readonly errorModelos = signal('');

  protected proveedor = '';
  protected modelo = '';
  protected apiKey = '';

  constructor() {
    void this.cargar();
  }

  protected etiquetaProveedor(p: string): string {
    return PROVEEDORES[p]?.etiqueta ?? p;
  }

  protected cambiarProveedor(): void {
    this.modelo = '';
    void this.cargarModelos();
  }

  /** Pide al backend los modelos que la cuenta puede usar con la clave guardada para ese proveedor. */
  protected async cargarModelos(): Promise<void> {
    if (!this.proveedor) return;
    this.cargandoModelos.set(true);
    this.errorModelos.set('');
    try {
      const r = await firstValueFrom(this.http.get<Modelos>(`${this.url}/modelos`, { params: { proveedor: this.proveedor } }));
      this.modelos.set(r.modelos);
      this.errorModelos.set(r.error ?? '');
      if (!this.modelo && r.modelos.length > 0) this.modelo = r.modelos[0];
    } catch {
      this.modelos.set([]);
      this.errorModelos.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoModelos.set(false);
    }
  }

  protected ayudaDe(p: string): string {
    return PROVEEDORES[p]?.ayuda ?? '';
  }

  protected fecha(iso: string): string {
    return new Date(iso).toLocaleString('es-CO', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  private aplicar(c: ConfigIa): void {
    this.actual.set(c);
    this.proveedor = c.proveedor;
    this.modelo = c.modelo;
    this.apiKey = '';
  }

  private async cargar(): Promise<void> {
    try {
      this.aplicar(await firstValueFrom(this.http.get<ConfigIa>(this.url)));
      void this.cargarModelos();
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async guardar(): Promise<void> {
    await this.enviar(
      {
        proveedor: this.proveedor,
        modelo: this.modelo.trim(),
        ...(this.apiKey.trim() ? { api_key: this.apiKey.trim() } : {}),
      },
      this.apiKey.trim() ? 'Clave guardada. Pruebe la conexión para confirmar que funciona.' : 'Configuración guardada.',
    );
  }

  protected async borrarClave(): Promise<void> {
    await this.enviar({ api_key: '' }, 'Clave borrada. El asistente usará la del servidor, si existe.');
  }

  private async enviar(cuerpo: Record<string, string>, mensaje: string): Promise<void> {
    this.guardando.set(true);
    this.errorGuardar.set('');
    this.exito.set('');
    this.prueba.set(null);
    try {
      this.aplicar(await firstValueFrom(this.http.put<ConfigIa>(this.url, cuerpo)));
      this.exito.set(mensaje);
      // Con una clave nueva (o sin clave) la lista de modelos de la cuenta puede cambiar.
      void this.cargarModelos();
    } catch (e) {
      // La clave se borra del formulario también si falla: no se deja escrita en pantalla.
      this.apiKey = '';
      const detalle = e instanceof HttpErrorResponse ? (e.error as { detail?: unknown })?.detail : null;
      this.errorGuardar.set(typeof detalle === 'string' ? detalle : MENSAJE_GENERICO);
    } finally {
      this.guardando.set(false);
    }
  }

  protected async probar(): Promise<void> {
    this.probando.set(true);
    this.prueba.set(null);
    try {
      this.prueba.set(await firstValueFrom(this.http.post<Prueba>(`${this.url}/probar`, {})));
    } catch {
      this.prueba.set({ ok: false, mensaje: MENSAJE_GENERICO });
    } finally {
      this.probando.set(false);
    }
  }

  protected async reindexar(): Promise<void> {
    this.reindexando.set(true);
    this.reindexado.set(null);
    try {
      this.reindexado.set(
        await firstValueFrom(this.http.post<Reindexado>(`${this.config.apiUrl}/ia/mantenimiento/reindexar-pendientes`, {})),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.reindexando.set(false);
    }
  }
}
