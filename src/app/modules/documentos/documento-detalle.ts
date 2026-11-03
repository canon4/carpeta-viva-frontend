import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { etiquetaCategoria, etiquetaEstadoFlujo, formatoTamanio } from './categorias';
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
  imports: [FormsModule, RouterLink],
  template: `
    @if (cargando()) {
      <p class="nota">Cargando documento...</p>
    }
    @if (errorGeneral()) {
      <p class="error" role="alert">{{ errorGeneral() }}</p>
    }

    @if (documento()) {
      <h1>{{ documento()!.titulo }}</h1>
      <p><a routerLink="/documentos">Volver a la lista de documentos</a></p>

      <section class="tarjeta">
        <h2>Metadatos</h2>
        <p>Categoría: {{ etiquetaCategoria(documento()!.categoria) }}</p>
        <p>Nombre del archivo: {{ documento()!.nombre_original }}</p>
        <p>Tipo: {{ documento()!.mime_type }}</p>
        <p>Tamaño: {{ formatoTamanio(documento()!.tamanio_bytes) }}</p>
        <p>Versión actual: {{ documento()!.version }}</p>
        <p>Estado del flujo: {{ etiquetaEstadoFlujo(documento()!.estado_flujo) }}</p>
        <p>Creado por: {{ documento()!.creado_por }}</p>
        @if (documento()!.revisado_por) {
          <p>Revisado por: {{ documento()!.revisado_por }} — {{ documento()!.revisado_en }}</p>
        }
        @if (documento()!.estado_flujo === 'devuelto' && documento()!.motivo_devolucion) {
          <p class="error" role="alert">Motivo de la devolución: {{ documento()!.motivo_devolucion }}</p>
        }

        @if (!esAuditor()) {
          <button type="button" (click)="descargar()" [disabled]="descargando()">
            {{ descargando() ? 'Descargando...' : 'Descargar archivo' }}
          </button>
        } @else {
          <p class="nota">El rol auditor solo ve metadatos; la descarga del archivo no está disponible.</p>
        }
      </section>

      <section class="tarjeta">
        <h2>Acciones</h2>

        @if (documento()!.estado_flujo === 'borrador') {
          <button type="button" (click)="enviar()" [disabled]="accionando()">Enviar a revisión</button>
        }

        @if (documento()!.estado_flujo === 'en_revision') {
          <button type="button" (click)="aprobar()" [disabled]="accionando()">Aprobar</button>
          @if (!mostrarDevolver()) {
            <button type="button" (click)="mostrarDevolver.set(true)" [disabled]="accionando()">Devolver</button>
          } @else {
            <form class="formulario" (ngSubmit)="devolver()" #fd="ngForm">
              <label for="motivoDevolucion">Motivo de la devolución</label>
              <input id="motivoDevolucion" name="motivoDevolucion" required [(ngModel)]="motivoDevolucion" />
              <button type="submit" [disabled]="fd.invalid || accionando()">Confirmar devolución</button>
              <button type="button" (click)="mostrarDevolver.set(false)">Cancelar</button>
            </form>
          }
        }

        @if (documento()!.estado_flujo === 'borrador' || documento()!.estado_flujo === 'devuelto') {
          <form class="formulario" (ngSubmit)="subirVersion()" #fv="ngForm">
            <label for="archivoVersion">Subir nueva versión (corrige el archivo cargado)</label>
            <input id="archivoVersion" name="archivoVersion" type="file" required (change)="seleccionarArchivo($event)" />
            <button type="submit" [disabled]="!archivoNuevaVersion() || accionando()">
              {{ accionando() ? 'Subiendo...' : 'Subir nueva versión' }}
            </button>
          </form>
        }

        @if (documento()!.estado_flujo === 'aprobado') {
          <p class="nota">Este documento ya está aprobado. No tiene acciones de flujo pendientes.</p>
        }
      </section>

      <section class="tarjeta">
        <h2>Versiones anteriores</h2>
        @if (!mostrarVersiones()) {
          <button type="button" (click)="cargarVersiones()">Ver versiones anteriores</button>
        } @else {
          @if (cargandoVersiones()) {
            <p class="nota">Cargando versiones...</p>
          }
          <table class="tabla">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Archivo</th>
                <th>Estado en ese momento</th>
                <th>Fecha</th>
                @if (!esAuditor()) {
                  <th>Descarga</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (v of versiones(); track v.id) {
                <tr>
                  <td>{{ v.version }}</td>
                  <td>{{ v.nombre_original || 'Sin nombre' }}</td>
                  <td>{{ etiquetaEstadoFlujo(v.estado_flujo) }}</td>
                  <td>{{ v.created_at }}</td>
                  @if (!esAuditor()) {
                    <td>
                      <button type="button" (click)="descargarVersion(v)" [disabled]="descargando()">Descargar</button>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
          @if (!cargandoVersiones() && versiones().length === 0) {
            <p class="nota">Este documento no tiene versiones anteriores.</p>
          }
        }
      </section>
    }
  `,
})
export class DocumentoDetalle {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  protected readonly documentoId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly etiquetaCategoria = etiquetaCategoria;
  protected readonly etiquetaEstadoFlujo = etiquetaEstadoFlujo;
  protected readonly formatoTamanio = formatoTamanio;

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

  protected readonly esAuditor = computed(() => this.auth.rol() === 'auditor');

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    if (!this.documentoId) {
      this.errorGeneral.set('No se indicó qué documento mostrar.');
      return;
    }
    this.cargando.set(true);
    this.errorGeneral.set('');
    try {
      this.documento.set(
        await firstValueFrom(this.http.get<Documento>(`${this.config.apiUrl}/documentos/${this.documentoId}`)),
      );
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
      if (this.mostrarVersiones()) await this.cargarVersiones();
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
