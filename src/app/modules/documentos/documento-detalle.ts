import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import { CatalogosService } from '../../core/catalogos/catalogos';
import type { components } from '../../core/api/schema';
import { VisorDocumento } from '../../shared/visor-documento/visor-documento';
import {
  CATEGORIAS_HOGAR,
  CATEGORIAS_MENOR,
  GRUPO_CATEGORIA_HOGAR,
  GRUPO_CATEGORIA_MENOR,
  etiquetaCategoria,
  etiquetaEstadoFlujo,
  formatoTamanio,
  type CategoriaOpcion,
} from './categorias';
import { descargarBlob } from './descargas';

type Documento = components['schemas']['DocumentoOut'];
type DocumentoVersion = components['schemas']['DocumentoVersionOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Detalle de un documento: metadatos, flujo (enviar, aprobar, devolver), nueva versión y
 * descarga. El auditor nunca ve el botón de descarga: el backend lo rechaza, pero aquí tampoco
 * se ofrece para no invitar al intento (RF11, ADR-0008 sección 4/6).
 */
@Component({
  selector: 'app-documento-detalle',
  imports: [FormsModule, RouterLink, VisorDocumento],
  styles: [`
    .volver { text-decoration: none; font-weight: 600; color: var(--color-primario); }
    .titulo-documento { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; margin-bottom: 1rem; }
    .titulo-documento h1 { margin: 0; }
    .aviso-devuelto { background: #fde4e1; color: #8a1f12; padding: 0.75rem 1rem; border-radius: var(--radio); margin: 0 0 1rem; }
    .detalle { display: grid; gap: 1.25rem; grid-template-columns: minmax(0, 3fr) minmax(16rem, 2fr); align-items: start; }
    .columna-vista { background: var(--color-superficie); border: 1px solid var(--color-borde); border-radius: var(--radio); padding: 0.75rem; max-height: 70vh; overflow: auto; }
    .columna-info { display: grid; gap: 1rem; background: var(--color-superficie); border: 1px solid var(--color-borde); border-radius: var(--radio); padding: 1rem; }
    .datos { display: grid; grid-template-columns: auto 1fr; gap: 0.35rem 1rem; margin: 0; }
    .datos dt { font-weight: 600; color: #3e4c59; }
    .datos dd { margin: 0; overflow-wrap: anywhere; }
    .pasos { list-style: none; display: flex; margin: 0; padding: 0; gap: 0.25rem; }
    .pasos li { flex: 1; text-align: center; font-size: 0.85rem; padding: 0.4rem 0.25rem; border-radius: 6px; background: #e8efed; color: #4f6461; }
    .pasos li.hecho { background: var(--color-primario-suave); color: var(--color-primario); }
    .pasos li.actual { background: var(--color-primario); color: #fff; font-weight: 700; }
    .accion-principal .nota { margin: 0.4rem 0 0; }
    .version-nueva { border-top: 1px solid var(--color-borde); padding-top: 0.75rem; }
    @media (max-width: 900px) { .detalle { grid-template-columns: 1fr; } }
  `],
  template: `
    <p><a routerLink="/documentos" class="volver">← Documentos</a></p>

    @if (cargando()) {
      <p class="nota" role="status">Cargando documento...</p>
    }
    @if (errorGeneral()) {
      <p class="error" role="alert">{{ errorGeneral() }}</p>
    }

    @if (documento(); as d) {
      <div class="titulo-documento">
        <h1>{{ d.titulo }}</h1>
        <span [class]="'estado estado-flujo-' + d.estado_flujo">{{ etiquetaEstadoFlujo(d.estado_flujo) }}</span>
      </div>

      @if (d.estado_flujo === 'devuelto' && d.motivo_devolucion) {
        <p class="aviso-devuelto" role="alert"><strong>Devuelto para corregir:</strong> {{ d.motivo_devolucion }}</p>
      }

      <div class="detalle">
        @if (!esAuditor()) {
          <section class="columna-vista" aria-label="Vista previa">
            <app-visor-documento [documentoId]="d.id" [mimeType]="d.mime_type" [nombreArchivo]="d.nombre_original" />
          </section>
        }

        <section class="columna-info" aria-label="Información y acciones">
          <dl class="datos">
            <dt>De</dt>
            <dd>
              @if (d.menor_id) {
                <a [routerLink]="['/menores', d.menor_id]">{{ nombreMenor() || 'Ver expediente del menor' }}</a>
              } @else {
                Documento del hogar
              }
            </dd>
            <dt>Categoría</dt>
            <dd>{{ etiquetaCategoria(d.categoria, catalogoCategorias()) }}</dd>
            <dt>Subido</dt>
            <dd>{{ quien(d.creado_por) }} · {{ fecha(d.created_at) }}</dd>
            @if (d.revisado_por) {
              <dt>{{ d.estado_flujo === 'devuelto' ? 'Devuelto' : 'Revisado' }}</dt>
              <dd>{{ quien(d.revisado_por) }}{{ d.revisado_en ? ' · ' + fecha(d.revisado_en) : '' }}</dd>
            }
            <dt>Archivo</dt>
            <dd>{{ d.nombre_original }} · {{ formatoTamanio(d.tamanio_bytes) }} · versión {{ d.version }}</dd>
          </dl>

          <ol class="pasos" aria-label="Estado del documento">
            @for (p of pasos; track p.valor) {
              <li [class.hecho]="pasoHecho(p.valor)" [class.actual]="pasoActual(p.valor)" [attr.aria-current]="pasoActual(p.valor) ? 'step' : null">{{ p.etiqueta }}</li>
            }
          </ol>

          <div class="accion-principal">
            @if (d.estado_flujo === 'borrador' && puedeEnviar()) {
              <button type="button" (click)="enviar()" [disabled]="accionando()">Enviar a revisión</button>
              <p class="nota">El profesional asignado lo revisará y lo aprobará o lo devolverá con un motivo.</p>
            } @else if (d.estado_flujo === 'en_revision' && puedeRevisar()) {
              @if (!mostrarDevolver()) {
                <div class="acciones">
                  <button type="button" (click)="aprobar()" [disabled]="accionando()">Aprobar</button>
                  <button type="button" class="boton-secundario" (click)="mostrarDevolver.set(true)" [disabled]="accionando()">Devolver</button>
                </div>
              } @else {
                <form (ngSubmit)="devolver()" #fd="ngForm" class="campo">
                  <label for="motivoDevolucion">¿Qué debe corregir? *</label>
                  <input id="motivoDevolucion" name="motivoDevolucion" required autocomplete="off" [(ngModel)]="motivoDevolucion" />
                  <div class="acciones">
                    <button type="submit" [disabled]="fd.invalid || accionando()">Devolver</button>
                    <button type="button" class="boton-secundario" (click)="mostrarDevolver.set(false)">Cancelar</button>
                  </div>
                </form>
              }
            } @else if (d.estado_flujo === 'en_revision') {
              <p class="nota">Enviado. Está esperando la revisión del profesional.</p>
            } @else if (d.estado_flujo === 'aprobado') {
              <p class="nota">Aprobado. No tiene acciones pendientes.</p>
            }
          </div>

          @if (!esAuditor()) {
            <div class="acciones">
              <button type="button" class="boton-secundario" (click)="descargar()" [disabled]="descargando()">{{ descargando() ? 'Descargando...' : 'Descargar' }}</button>
              @if ((d.estado_flujo === 'borrador' || d.estado_flujo === 'devuelto') && puedeEnviar() && !mostrarVersionNueva()) {
                <button type="button" class="boton-secundario" (click)="mostrarVersionNueva.set(true)">Subir versión corregida</button>
              }
            </div>
            @if (mostrarVersionNueva()) {
              <form class="campo version-nueva" (ngSubmit)="subirVersion()">
                <label for="archivoVersion">Archivo corregido *</label>
                <input id="archivoVersion" name="archivoVersion" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*" required (change)="seleccionarArchivo($event)" />
                <p class="nota">La versión actual se guarda en el historial y el documento vuelve a revisión.</p>
                <div class="acciones">
                  <button type="submit" [disabled]="!archivoNuevaVersion() || accionando()">{{ accionando() ? 'Subiendo...' : 'Subir' }}</button>
                  <button type="button" class="boton-secundario" (click)="mostrarVersionNueva.set(false)">Cancelar</button>
                </div>
              </form>
            }
          } @else {
            <p class="nota">Como auditor ve solo los datos del documento, no su contenido.</p>
          }
        </section>
      </div>

      @if (d.version > 1) {
        <section class="seccion" aria-labelledby="tituloVersiones">
          <h2 id="tituloVersiones">Versiones anteriores</h2>
          @if (cargandoVersiones()) {
            <p class="nota" role="status">Cargando versiones...</p>
          } @else if (versiones().length === 0) {
            <p class="nota">No hay versiones anteriores.</p>
          } @else {
            <table class="tabla-datos" aria-label="Versiones anteriores">
              <thead>
                <tr><th scope="col">Versión</th><th scope="col">Fecha</th><th scope="col">Estado entonces</th><th scope="col">Archivo</th>
                  @if (!esAuditor()) { <th scope="col">Acción</th> }
                </tr>
              </thead>
              <tbody>
                @for (v of versiones(); track v.id) {
                  <tr>
                    <td data-etiqueta="Versión">{{ v.version }}</td>
                    <td data-etiqueta="Fecha">{{ fecha(v.created_at) }}</td>
                    <td data-etiqueta="Estado entonces">{{ etiquetaEstadoFlujo(v.estado_flujo) }}</td>
                    <td data-etiqueta="Archivo">{{ v.nombre_original || 'Sin nombre' }}{{ v.comprimida ? ' (copia liviana)' : '' }}</td>
                    @if (!esAuditor()) {
                      <td data-etiqueta="Acción"><button type="button" class="boton-secundario" (click)="descargarVersion(v)" [disabled]="descargando()">Descargar</button></td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          }
        </section>
      }
    }
  `,
})
export class DocumentoDetalle {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly catalogos = inject(CatalogosService);
  protected readonly documentoId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly etiquetaCategoria = etiquetaCategoria;
  protected readonly etiquetaEstadoFlujo = etiquetaEstadoFlujo;
  protected readonly formatoTamanio = formatoTamanio;
  // Combina categoría de menor y de hogar (no se sabe cuál aplica sin consultar el documento);
  // valor por defecto embebido como respaldo (ADR-0013 sección 7, punto 1).
  protected readonly catalogoCategorias = signal<CategoriaOpcion[]>([...CATEGORIAS_MENOR, ...CATEGORIAS_HOGAR]);

  protected readonly documento = signal<Documento | null>(null);
  protected readonly cargando = signal(false);
  protected readonly errorGeneral = signal('');
  protected readonly accionando = signal(false);
  protected readonly descargando = signal(false);

  protected readonly mostrarDevolver = signal(false);
  protected motivoDevolucion = '';

  protected readonly mostrarVersiones = signal(false);
  protected readonly cargandoVersiones = signal(false);
  protected readonly versiones = signal<DocumentoVersion[]>([]);

  protected readonly archivoNuevaVersion = signal<File | null>(null);
  protected readonly mostrarVersionNueva = signal(false);

  protected readonly esAuditor = computed(() => this.auth.rol() === 'auditor');
  // Envía y corrige quien lo creó (la madre); aprueban o devuelven los profesionales asignados.
  protected readonly puedeEnviar = computed(() => {
    const d = this.documento();
    return !!d && (d.creado_por === this.auth.usuario()?.id || this.auth.rol() === 'admin');
  });
  protected readonly puedeRevisar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor' || rol === 'admin';
  });

  protected readonly nombreMenor = signal('');
  private readonly madre = signal<{ usuario_id: string | null; nombre: string | null }>({ usuario_id: null, nombre: null });

  protected readonly pasos = [
    { valor: 'borrador', etiqueta: 'Borrador' },
    { valor: 'en_revision', etiqueta: 'En revisión' },
    { valor: 'final', etiqueta: 'Aprobado o devuelto' },
  ];
  private readonly orden: Record<string, number> = { borrador: 0, en_revision: 1, aprobado: 2, devuelto: 2 };

  constructor() {
    void this.cargar();
    void this.cargarCatalogos();
  }

  protected pasoActual(paso: string): boolean {
    const estado = this.documento()?.estado_flujo ?? '';
    return paso === 'final' ? this.orden[estado] === 2 : paso === estado;
  }

  protected pasoHecho(paso: string): boolean {
    const estado = this.documento()?.estado_flujo ?? '';
    const indice = paso === 'final' ? 2 : this.orden[paso];
    return indice < (this.orden[estado] ?? 0);
  }

  /** "usted", la madre del hogar por su nombre, o un texto genérico: nunca el identificador. */
  protected quien(usuarioId: string | null | undefined): string {
    if (!usuarioId) return 'Sin dato';
    if (usuarioId === this.auth.usuario()?.id) return 'Por usted';
    if (usuarioId === this.madre().usuario_id && this.madre().nombre) return `Por ${this.madre().nombre}`;
    return 'Por otro usuario';
  }

  protected fecha(iso: string): string {
    const f = new Date(iso);
    if (Number.isNaN(f.getTime())) return iso;
    return f.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  /** Nombre del menor y de la madre de su hogar, para mostrar personas en lugar de códigos. */
  private async cargarPersonas(menorId: string): Promise<void> {
    const api = this.config.apiUrl;
    const [menor, hogar] = await Promise.allSettled([
      firstValueFrom(this.http.get<{ nombres: string; apellidos: string }>(`${api}/menores/${menorId}`)),
      firstValueFrom(this.http.get<{ madre_usuario_id?: string | null; madre_nombre?: string | null } | null>(`${api}/menores/${menorId}/hogar-vigente`)),
    ]);
    if (menor.status === 'fulfilled') this.nombreMenor.set(`${menor.value.nombres} ${menor.value.apellidos}`);
    if (hogar.status === 'fulfilled' && hogar.value) {
      this.madre.set({ usuario_id: hogar.value.madre_usuario_id ?? null, nombre: hogar.value.madre_nombre ?? null });
    }
  }

  private async cargarCatalogos(): Promise<void> {
    try {
      const [menor, hogar] = await Promise.all([
        this.catalogos.obtener(GRUPO_CATEGORIA_MENOR),
        this.catalogos.obtener(GRUPO_CATEGORIA_HOGAR),
      ]);
      this.catalogoCategorias.set([...menor, ...hogar]);
    } catch {
      /* se mantiene el valor por defecto embebido como respaldo */
    }
  }

  private async cargar(): Promise<void> {
    if (!this.documentoId) {
      this.errorGeneral.set('No se indicó qué documento mostrar.');
      return;
    }
    this.cargando.set(true);
    this.errorGeneral.set('');
    try {
      const documento = await firstValueFrom(this.http.get<Documento>(`${this.config.apiUrl}/documentos/${this.documentoId}`));
      this.documento.set(documento);
      if (documento.menor_id) void this.cargarPersonas(documento.menor_id);
      if (documento.version > 1) void this.cargarVersiones();
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene acceso a este documento.'
          : MENSAJE_GENERICO,
      );
    } finally {
      this.cargando.set(false);
    }
  }

  protected async descargar(): Promise<void> {
    const documento = this.documento();
    if (!documento) return;
    this.descargando.set(true);
    this.errorGeneral.set('');
    try {
      const respuesta = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/documentos/${documento.id}/contenido`, {
          responseType: 'blob',
          observe: 'response',
        }),
      );
      descargarBlob(respuesta as HttpResponse<Blob>, documento.nombre_original);
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene permiso para descargar este archivo.'
          : MENSAJE_GENERICO,
      );
    } finally {
      this.descargando.set(false);
    }
  }

  protected async descargarVersion(v: DocumentoVersion): Promise<void> {
    const documento = this.documento();
    if (!documento) return;
    this.descargando.set(true);
    this.errorGeneral.set('');
    try {
      const respuesta = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/documentos/${documento.id}/versiones/${v.version}/contenido`, {
          responseType: 'blob',
          observe: 'response',
        }),
      );
      descargarBlob(respuesta as HttpResponse<Blob>, v.nombre_original ?? 'documento');
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene permiso para descargar esta versión.'
          : MENSAJE_GENERICO,
      );
    } finally {
      this.descargando.set(false);
    }
  }

  protected async enviar(): Promise<void> {
    await this.ejecutarAccion(
      firstValueFrom(this.http.put<Documento>(`${this.config.apiUrl}/documentos/${this.documentoId}/enviar`, {})),
    );
  }

  protected async aprobar(): Promise<void> {
    await this.ejecutarAccion(
      firstValueFrom(this.http.put<Documento>(`${this.config.apiUrl}/documentos/${this.documentoId}/aprobar`, {})),
    );
  }

  protected async devolver(): Promise<void> {
    await this.ejecutarAccion(
      firstValueFrom(
        this.http.put<Documento>(`${this.config.apiUrl}/documentos/${this.documentoId}/devolver`, {
          motivo: this.motivoDevolucion,
        }),
      ),
    );
    this.mostrarDevolver.set(false);
    this.motivoDevolucion = '';
  }

  private async ejecutarAccion(promesa: Promise<Documento>): Promise<void> {
    this.accionando.set(true);
    this.errorGeneral.set('');
    try {
      this.documento.set(await promesa);
    } catch (e) {
      this.errorGeneral.set(this.mensajeError(e));
    } finally {
      this.accionando.set(false);
    }
  }

  protected seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    this.archivoNuevaVersion.set(input.files?.[0] ?? null);
  }

  protected async subirVersion(): Promise<void> {
    const archivo = this.archivoNuevaVersion();
    if (!archivo) return;
    this.accionando.set(true);
    this.errorGeneral.set('');
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      this.documento.set(
        await firstValueFrom(
          this.http.post<Documento>(`${this.config.apiUrl}/documentos/${this.documentoId}/version`, datos),
        ),
      );
      this.archivoNuevaVersion.set(null);
      this.mostrarVersionNueva.set(false);
      await this.cargarVersiones();
    } catch (e) {
      this.errorGeneral.set(this.mensajeError(e));
    } finally {
      this.accionando.set(false);
    }
  }

  protected async cargarVersiones(): Promise<void> {
    this.mostrarVersiones.set(true);
    this.cargandoVersiones.set(true);
    try {
      this.versiones.set(
        await firstValueFrom(
          this.http.get<DocumentoVersion[]>(`${this.config.apiUrl}/documentos/${this.documentoId}/versiones`),
        ),
      );
    } catch {
      this.errorGeneral.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoVersiones.set(false);
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
