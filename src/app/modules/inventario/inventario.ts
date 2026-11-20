import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import { SelectorHogar } from '../../shared/selector-hogar/selector-hogar';
import type { components } from '../../core/api/schema';

type Item = components['schemas']['InventarioItemOut'];
type Foto = components['schemas']['InventarioItemFotoOut'];
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
    <div class="encabezado-modulo">
      <h1>Inventario del hogar</h1>
    </div>

    <datalist id="relaciones">
      <option value="Hijo o hija"></option>
      <option value="Esposo o compañero"></option>
      <option value="Madre o padre"></option>
      <option value="Hermano o hermana"></option>
      <option value="Nieto o nieta"></option>
      <option value="Otro familiar"></option>
      <option value="Vecino o vecina"></option>
      <option value="Amigo o amiga"></option>
    </datalist>

    <div class="filtros">
      <div class="campo">
        <app-selector-hogar [valor]="hogarId" [requerido]="true" (valorChange)="hogarId = $event; cargarTodo()" />
      </div>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (cargando()) {
      <p class="nota" role="status">Cargando inventario...</p>
    } @else if (!hogarCargado()) {
      <p class="nota">Elija un hogar para ver su inventario.</p>
    }

    @if (hogarCargado()) {
      <div class="pestanas" role="tablist" aria-label="Secciones del inventario">
        <button type="button" role="tab" [attr.aria-selected]="pestana() === 'items'" [class.activa]="pestana() === 'items'" (click)="cambiarPestana('items')">
          Camas y muebles ({{ items().length }})
        </button>
        <button type="button" role="tab" [attr.aria-selected]="pestana() === 'personas'" [class.activa]="pestana() === 'personas'" (click)="cambiarPestana('personas')">
          Personas del hogar ({{ convivientesActivos() }})
        </button>
        <button type="button" role="tab" [attr.aria-selected]="pestana() === 'red'" [class.activa]="pestana() === 'red'" (click)="cambiarPestana('red')">
          Red de apoyo ({{ redActiva() }})
        </button>
      </div>

      @if (pestana() === 'items') {
        <section role="tabpanel" aria-label="Camas y muebles">
          @if (puedeEscribir() && !formularioAbierto()) {
            <div class="acciones" style="margin-bottom: 1rem">
              <button type="button" (click)="formularioAbierto.set(true)">{{ esCoordinador() ? 'Hacer pedido' : 'Registrar cama o mueble' }}</button>
            </div>
          }
          @if (formularioAbierto()) {
            <form class="panel-formulario" (ngSubmit)="crearItem()" #fi="ngForm" aria-labelledby="tituloItem">
              <h2 id="tituloItem">{{ esCoordinador() ? 'Hacer pedido' : 'Registrar cama o mueble' }}</h2>
              <p class="nota">
                {{ esCoordinador() ? 'Quedará pendiente hasta que la madre confirme que llegó.' : 'Registre algo que ya está en el hogar.' }}
              </p>
              <div class="campos">
                <div class="campo">
                  <label for="nTipoItem">Tipo *</label>
                  <select id="nTipoItem" name="nTipoItem" required [(ngModel)]="nuevoItem.tipo">
                    <option value="cama">Cama</option>
                    <option value="mueble">Mueble</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
                <div class="campo">
                  <label for="nDescItem">Descripción *</label>
                  <input id="nDescItem" name="nDescItem" required autocomplete="off" placeholder="Ej.: cama sencilla con colchón" [(ngModel)]="nuevoItem.descripcion" />
                </div>
                <div class="campo">
                  <label for="nCantItem">Cantidad *</label>
                  <input id="nCantItem" name="nCantItem" type="number" inputmode="numeric" min="1" required [(ngModel)]="nuevoItem.cantidad" />
                </div>
              </div>
              <div class="acciones">
                <button type="submit" [disabled]="fi.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
                <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
              </div>
            </form>
          }

          @if (itemSeleccionado(); as i) {
            <section class="panel-formulario" [attr.aria-label]="'Ítem ' + i.descripcion">
              @if (modo() === 'recepcion') {
                <h2>Confirmar que llegó: {{ i.descripcion }}</h2>
                <div class="campos">
                  <div class="campo">
                    <label for="estadoRecepcion">¿En qué estado llegó? *</label>
                    <select id="estadoRecepcion" [(ngModel)]="estadoRecepcion[i.id]">
                      <option value="bueno">Bueno</option>
                      <option value="regular">Regular</option>
                      <option value="malo">Malo</option>
                    </select>
                  </div>
                </div>
                <div class="acciones">
                  <button type="button" (click)="confirmarRecepcion(i); cerrarPanel()" [disabled]="guardandoId() === i.id">Confirmar que llegó</button>
                  <button type="button" class="boton-secundario" (click)="cerrarPanel()">Cancelar</button>
                </div>
              } @else if (modo() === 'estado') {
                <h2>Cambiar estado: {{ i.descripcion }}</h2>
                <div class="campos">
                  <div class="campo">
                    <label for="estadoItem">Estado *</label>
                    <select id="estadoItem" [(ngModel)]="estadoItemEdicion[i.id]">
                      <option value="bueno">Bueno</option>
                      <option value="regular">Regular</option>
                      <option value="malo">Malo</option>
                      <option value="retirado">Retirado (ya no está en el hogar)</option>
                    </select>
                  </div>
                </div>
                <div class="acciones">
                  <button type="button" (click)="actualizarItem(i); cerrarPanel()" [disabled]="guardandoId() === i.id">Guardar</button>
                  <button type="button" class="boton-secundario" (click)="cerrarPanel()">Cancelar</button>
                </div>
              } @else {
                <h2>Fotos de evidencia: {{ i.descripcion }}</h2>
                @if (errorFotos()[i.id]) {
                  <p class="error" role="alert">{{ errorFotos()[i.id] }}</p>
                }
                @if (cargandoFotos() === i.id) {
                  <p class="nota" role="status">Cargando fotos...</p>
                } @else if ((fotosPorItem()[i.id] ?? []).length === 0 && !errorFotos()[i.id]) {
                  <p class="nota">Este ítem no tiene fotos.</p>
                }
                <div class="galeria">
                  @for (f of fotosPorItem()[i.id] ?? []; track f.id) {
                    <figure>
                      @if (urlFoto()[f.id]) {
                        <img [src]="urlFoto()[f.id]" alt="Foto de evidencia de recepción" class="foto-evidencia" />
                      } @else {
                        <button type="button" class="boton-secundario" (click)="verFoto(i, f)">Ver foto</button>
                      }
                      <figcaption class="nota">
                        {{ f.creado_en.slice(0, 10) }}{{ f.oculta ? ' · oculta' : '' }}
                        @if (esAdmin() && !f.oculta) {
                          <button type="button" class="boton-secundario" (click)="ocultarFoto(i, f)">Ocultar</button>
                        }
                      </figcaption>
                    </figure>
                  }
                </div>
                @if (esMadreOAdmin()) {
                  <form class="campos" (ngSubmit)="subirFoto(i)" style="margin-top: 1rem">
                    <div class="campo">
                      <label for="archivoFoto">Tomar o subir foto</label>
                      <input id="archivoFoto" name="archivoFoto" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" (change)="seleccionarFoto(i, $event)" />
                    </div>
                    <div class="campo">
                      <label class="casilla">
                        <input type="checkbox" name="declaracionFoto" required [(ngModel)]="declaracionSinMenores[i.id]" />
                        Confirmo que la foto no muestra a ningún niño, niña o adolescente
                      </label>
                    </div>
                    <div class="acciones">
                      <button type="submit" [disabled]="!archivoFotoSeleccionado[i.id] || !declaracionSinMenores[i.id] || subiendoFoto() === i.id">
                        {{ subiendoFoto() === i.id ? 'Subiendo...' : 'Subir foto' }}
                      </button>
                    </div>
                  </form>
                }
                <div class="acciones">
                  <button type="button" class="boton-secundario" (click)="cerrarPanel()">Cerrar</button>
                </div>
              }
            </section>
          }

          @if (items().length === 0) {
            <p class="nota">Este hogar no tiene camas ni muebles registrados.</p>
          } @else {
            <table class="tabla-datos" aria-label="Camas y muebles">
              <thead>
                <tr>
                  <th scope="col">Descripción</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Cantidad</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Acciones</th>
                </tr>
              </thead>
              <tbody>
                @for (i of items(); track i.id) {
                  <tr>
                    <td data-etiqueta="Descripción"><strong>{{ i.descripcion }}</strong></td>
                    <td data-etiqueta="Tipo">{{ etiquetaTipo(i.tipo) }}</td>
                    <td data-etiqueta="Cantidad">{{ i.cantidad }}</td>
                    <td data-etiqueta="Estado">
                      @if (!i.recibido) {
                        <span class="estado estado-flujo-en_revision">Pedido, no ha llegado</span>
                      } @else {
                        <span [class]="'estado estado-item-' + i.estado">{{ etiquetaEstadoItem(i.estado) }}</span>
                      }
                    </td>
                    <td data-etiqueta="Acciones">
                      <div class="acciones-fila">
                        @if (!i.recibido && esMadreOAdmin()) {
                          <button type="button" (click)="abrirPanel(i, 'recepcion')">Llegó</button>
                        }
                        @if (i.recibido && puedeEscribir()) {
                          <button type="button" class="boton-secundario" (click)="abrirPanel(i, 'estado')">Cambiar estado</button>
                        }
                        @if (i.recibido && puedeVerFotos()) {
                          <button type="button" class="boton-secundario" (click)="abrirPanel(i, 'fotos')">Fotos</button>
                        }
                      </div>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }

      @if (pestana() === 'personas') {
        <section role="tabpanel" aria-label="Personas del hogar">
          <p class="nota">Personas que viven en el hogar además de la madre y los niños, niñas y adolescentes.</p>
          @if (puedeEscribir() && !formularioAbierto()) {
            <div class="acciones" style="margin-bottom: 1rem">
              <button type="button" (click)="formularioAbierto.set(true)">Agregar persona</button>
            </div>
          }
          @if (formularioAbierto()) {
            <form class="panel-formulario" (ngSubmit)="crearConviviente()" #fc="ngForm" aria-label="Agregar persona">
              <div class="campos">
                <div class="campo">
                  <label for="nNombresConv">Nombre completo *</label>
                  <input id="nNombresConv" name="nNombresConv" required autocomplete="off" [(ngModel)]="nuevoConviviente.nombres" />
                </div>
                <div class="campo">
                  <label for="nRelacionConv">Relación con la madre *</label>
                  <input id="nRelacionConv" name="nRelacionConv" required list="relaciones" autocomplete="off" [(ngModel)]="nuevoConviviente.relacion_con_madre" />
                </div>
                <div class="campo">
                  <label for="nFechaConv">Vive en el hogar desde</label>
                  <input id="nFechaConv" name="nFechaConv" type="date" [max]="hoy" [(ngModel)]="nuevoConviviente.fecha_desde" />
                </div>
              </div>
              <div class="acciones">
                <button type="submit" [disabled]="fc.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
                <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
              </div>
            </form>
          }
          @if (convivientes().length === 0) {
            <p class="nota">No hay otras personas registradas.</p>
          } @else {
            <table class="tabla-datos" aria-label="Personas del hogar">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Relación</th>
                  <th scope="col">Desde</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                @for (c of convivientes(); track c.id) {
                  <tr>
                    <td data-etiqueta="Nombre"><strong>{{ c.nombres }}</strong></td>
                    <td data-etiqueta="Relación">{{ c.relacion_con_madre }}</td>
                    <td data-etiqueta="Desde">{{ c.fecha_desde || '—' }}</td>
                    <td data-etiqueta="Estado">
                      @if (c.activo) {
                        <div class="acciones-fila">
                          <span class="estado estado-activo">Vive aquí</span>
                          @if (puedeEscribir()) {
                            <button type="button" class="boton-secundario" (click)="desactivarConviviente(c)" [disabled]="guardandoId() === c.id">Ya no vive aquí</button>
                          }
                        </div>
                      } @else {
                        <span class="estado">Ya no vive aquí</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }

      @if (pestana() === 'red') {
        <section role="tabpanel" aria-label="Red de apoyo">
          @if (puedeEscribir() && !formularioAbierto()) {
            <div class="acciones" style="margin-bottom: 1rem">
              <button type="button" (click)="formularioAbierto.set(true)">Agregar contacto</button>
            </div>
          }
          @if (formularioAbierto()) {
            <form class="panel-formulario" (ngSubmit)="crearRedApoyo()" #fr="ngForm" aria-label="Agregar contacto">
              <div class="campos">
                <div class="campo">
                  <label for="nNombresRed">Nombre completo *</label>
                  <input id="nNombresRed" name="nNombresRed" required autocomplete="off" [(ngModel)]="nuevoRedApoyo.nombres" />
                </div>
                <div class="campo">
                  <label for="nRelacionRed">Relación *</label>
                  <input id="nRelacionRed" name="nRelacionRed" required list="relaciones" autocomplete="off" [(ngModel)]="nuevoRedApoyo.relacion" />
                </div>
                <div class="campo">
                  <label for="nTelefonoRed">Teléfono</label>
                  <input id="nTelefonoRed" name="nTelefonoRed" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="nuevoRedApoyo.telefono" />
                </div>
              </div>
              <div class="acciones">
                <button type="submit" [disabled]="fr.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
                <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
              </div>
            </form>
          }
          @if (redApoyo().length === 0) {
            <p class="nota">No hay contactos de red de apoyo.</p>
          } @else {
            <table class="tabla-datos" aria-label="Red de apoyo">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Relación</th>
                  <th scope="col">Teléfono</th>
                  <th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                @for (r of redApoyo(); track r.id) {
                  <tr>
                    <td data-etiqueta="Nombre"><strong>{{ r.nombres }}</strong></td>
                    <td data-etiqueta="Relación">{{ r.relacion }}</td>
                    <td data-etiqueta="Teléfono">
                      @if (r.telefono) { <a [href]="'tel:' + r.telefono">{{ r.telefono }}</a> } @else { — }
                    </td>
                    <td data-etiqueta="Estado">
                      @if (r.activo) {
                        <div class="acciones-fila">
                          <span class="estado estado-activo">Activo</span>
                          @if (puedeEscribir()) {
                            <button type="button" class="boton-secundario" (click)="desactivarRedApoyo(r)" [disabled]="guardandoId() === r.id">Desactivar</button>
                          }
                        </div>
                      } @else {
                        <span class="estado">Desactivado</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }
    }
  `,
  styles: [
    `
      .etiqueta-pendiente {
        color: #8a5a00;
        font-weight: 600;
      }
      .etiqueta-recibido {
        color: #18664f;
        font-weight: 600;
      }
      .foto-evidencia {
        max-width: 100%;
        max-height: 40vh;
        display: block;
        border-radius: 8px;
      }
    `,
  ],
})
export class Inventario {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  protected readonly esCoordinador = computed(() => this.auth.rol() === 'coordinador');
  protected readonly esAdmin = computed(() => this.auth.rol() === 'admin');
  protected readonly esCoordinadorOAdmin = computed(
    () => this.auth.rol() === 'coordinador' || this.auth.rol() === 'admin',
  );

  protected readonly esMadreOAdmin = computed(() => this.auth.rol() === 'madre' || this.auth.rol() === 'admin');
  // Escriben madre, coordinador y admin; profesionales y defensores solo consultan (supuesto S14).
  protected readonly puedeEscribir = computed(() => {
    const rol = this.auth.rol();
    return rol === 'madre' || rol === 'coordinador' || rol === 'admin';
  });
  // Fotos de evidencia: solo madre, admin y auditor las ven (ADR-0014 sección 2.1).
  protected readonly puedeVerFotos = computed(() => {
    const rol = this.auth.rol();
    return rol === 'madre' || rol === 'admin' || rol === 'auditor';
  });

  protected readonly hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local (toISOString usa UTC)
  protected readonly pestana = signal<'items' | 'personas' | 'red'>('items');
  protected readonly formularioAbierto = signal(false);
  protected readonly itemSeleccionadoId = signal<string | null>(null);
  protected readonly modo = signal<'recepcion' | 'estado' | 'fotos'>('estado');
  protected readonly itemSeleccionado = computed(
    () => this.items().find((i) => i.id === this.itemSeleccionadoId()) ?? null,
  );
  protected readonly convivientesActivos = computed(() => this.convivientes().filter((c) => c.activo).length);
  protected readonly redActiva = computed(() => this.redApoyo().filter((r) => r.activo).length);

  protected cambiarPestana(p: 'items' | 'personas' | 'red'): void {
    this.pestana.set(p);
    this.formularioAbierto.set(false);
    this.cerrarPanel();
  }

  protected abrirPanel(i: Item, modo: 'recepcion' | 'estado' | 'fotos'): void {
    this.modo.set(modo);
    this.itemSeleccionadoId.set(i.id);
    if (modo === 'fotos' && !this.itemsConFotosCargadas.has(i.id)) {
      this.itemsConFotosCargadas.add(i.id);
      void this.cargarFotos(i);
    }
  }

  protected cerrarPanel(): void {
    this.itemSeleccionadoId.set(null);
  }

  protected etiquetaTipo(tipo: string): string {
    return ({ cama: 'Cama', mueble: 'Mueble', otro: 'Otro' } as Record<string, string>)[tipo] ?? tipo;
  }

  protected etiquetaEstadoItem(estado: string): string {
    return ({ bueno: 'Bueno', regular: 'Regular', malo: 'Malo', retirado: 'Retirado' } as Record<string, string>)[estado] ?? estado;
  }

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
  protected readonly estadoRecepcion: Record<string, string> = {};

  // Fotos de evidencia por ítem (ADR-0014 sección 2/2.1): solo visibles para madre/admin/auditor;
  // se cargan al abrir el <details> de cada ítem recibido, no de entrada.
  protected readonly fotosPorItem = signal<Record<string, Foto[]>>({});
  protected readonly cargandoFotos = signal<string | null>(null);
  protected readonly errorFotos = signal<Record<string, string>>({});
  protected readonly urlFoto = signal<Record<string, string>>({});
  protected readonly archivoFotoSeleccionado: Record<string, File | null> = {};
  protected readonly declaracionSinMenores: Record<string, boolean> = {};
  protected readonly subiendoFoto = signal<string | null>(null);
  private readonly itemsConFotosCargadas = new Set<string>();

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
      for (const i of items) {
        this.estadoItemEdicion[i.id] = i.estado;
        this.estadoRecepcion[i.id] = 'bueno';
        this.declaracionSinMenores[i.id] = false;
      }
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
      this.estadoRecepcion[creado.id] = 'bueno';
      this.declaracionSinMenores[creado.id] = false;
      this.nuevoItem = { tipo: 'cama', descripcion: '', cantidad: 1 };
      this.formularioAbierto.set(false);
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

  protected async confirmarRecepcion(i: Item): Promise<void> {
    this.guardandoId.set(i.id);
    this.error.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Item>(`${this.config.apiUrl}/inventario/items/${i.id}/recepcion`, {
          estado: this.estadoRecepcion[i.id],
        }),
      );
      this.items.set(this.items().map((x) => (x.id === actualizado.id ? actualizado : x)));
      this.estadoItemEdicion[actualizado.id] = actualizado.estado;
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardandoId.set(null);
    }
  }

  private async cargarFotos(i: Item): Promise<void> {
    this.cargandoFotos.set(i.id);
    this.errorFotos.set({ ...this.errorFotos(), [i.id]: '' });
    try {
      const fotos = await firstValueFrom(
        this.http.get<Foto[]>(`${this.config.apiUrl}/inventario/items/${i.id}/fotos`),
      );
      this.fotosPorItem.set({ ...this.fotosPorItem(), [i.id]: fotos });
    } catch (e) {
      const mensaje =
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene permiso para ver las fotos de este ítem.'
          : MENSAJE_GENERICO;
      this.errorFotos.set({ ...this.errorFotos(), [i.id]: mensaje });
    } finally {
      this.cargandoFotos.set(null);
    }
  }

  protected async verFoto(i: Item, f: Foto): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/inventario/items/${i.id}/fotos/${f.id}`, { responseType: 'blob' }),
      );
      this.urlFoto.set({ ...this.urlFoto(), [f.id]: URL.createObjectURL(blob) });
    } catch {
      this.errorFotos.set({ ...this.errorFotos(), [i.id]: MENSAJE_GENERICO });
    }
  }

  protected seleccionarFoto(i: Item, evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivoFotoSeleccionado[i.id] = input.files?.[0] ?? null;
  }

  protected async subirFoto(i: Item): Promise<void> {
    const archivo = this.archivoFotoSeleccionado[i.id];
    if (!archivo || !this.declaracionSinMenores[i.id]) return;
    this.subiendoFoto.set(i.id);
    this.errorFotos.set({ ...this.errorFotos(), [i.id]: '' });
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      datos.append('declaracion_sin_menores', 'true');
      const creada = await firstValueFrom(
        this.http.post<Foto>(`${this.config.apiUrl}/inventario/items/${i.id}/fotos`, datos),
      );
      const actuales = this.fotosPorItem()[i.id] ?? [];
      this.fotosPorItem.set({ ...this.fotosPorItem(), [i.id]: [...actuales, creada] });
      this.archivoFotoSeleccionado[i.id] = null;
      this.declaracionSinMenores[i.id] = false;
    } catch (e) {
      const mensaje =
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene permiso para subir fotos de este ítem.'
          : this.mensajeError(e);
      this.errorFotos.set({ ...this.errorFotos(), [i.id]: mensaje });
    } finally {
      this.subiendoFoto.set(null);
    }
  }

  protected async ocultarFoto(i: Item, f: Foto): Promise<void> {
    if (!confirm('¿Ocultar esta foto? Dejará de verse para madre y coordinador, pero no se elimina.')) return;
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Foto>(`${this.config.apiUrl}/inventario/items/${i.id}/fotos/${f.id}/ocultar`, {}),
      );
      const actuales = (this.fotosPorItem()[i.id] ?? []).map((x) => (x.id === actualizada.id ? actualizada : x));
      this.fotosPorItem.set({ ...this.fotosPorItem(), [i.id]: actuales });
    } catch {
      this.errorFotos.set({ ...this.errorFotos(), [i.id]: MENSAJE_GENERICO });
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
      this.formularioAbierto.set(false);
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
      this.formularioAbierto.set(false);
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
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
