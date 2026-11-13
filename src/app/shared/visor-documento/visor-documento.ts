import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, Input, OnChanges, signal } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import { esVisualizable } from '../../modules/documentos/categorias';

/**
 * Visor de documentos en pantalla (ADR-0011): solo lectura. Para corregir un documento, el flujo
 * sigue siendo descargarlo, editarlo fuera del sistema y subir una nueva versión (no cambia aquí).
 * Reutilizable desde cualquier pantalla/rol que ya tenga acceso al documento: la autorización real
 * la resuelve `GET /documentos/{id}/vista` en el backend, este componente solo decide qué mostrar.
 */
@Component({
  selector: 'app-visor-documento',
  template: `
    @if (!esVisualizable(mimeType)) {
      <p class="nota">
        Este tipo de archivo no se puede previsualizar en el sistema. Descárguelo para verlo.
      </p>
    } @else if (cargando()) {
      <p class="nota">Cargando vista previa...</p>
    } @else if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    } @else if (url()) {
      @if (esImagen()) {
        <img [src]="url()" [alt]="nombreArchivo" class="visor-imagen" />
      } @else {
        <iframe [src]="url()" [title]="nombreArchivo" class="visor-pdf"></iframe>
      }
    }
  `,
  styles: [`
    .visor-imagen {
      max-width: 100%;
      max-height: 70vh;
      display: block;
      border-radius: 8px;
    }
    .visor-pdf {
      width: 100%;
      height: 70vh;
      border: 1px solid #e1e7ec;
      border-radius: 8px;
    }
  `],
})
export class VisorDocumento implements OnChanges {
  @Input({ required: true }) documentoId = '';
  @Input({ required: true }) mimeType = '';
  @Input() nombreArchivo = 'documento';

  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly esVisualizable = esVisualizable;
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly url = signal<SafeResourceUrl | null>(null);
  protected esImagen(): boolean {
    return this.mimeType.startsWith('image/');
  }

  private urlObjeto: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.liberarUrl());
  }

  ngOnChanges(): void {
    this.liberarUrl();
    this.url.set(null);
    this.error.set('');
    if (esVisualizable(this.mimeType)) {
      void this.cargar();
    }
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/documentos/${this.documentoId}/vista`, { responseType: 'blob' }),
      );
      this.urlObjeto = URL.createObjectURL(blob);
      this.url.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.urlObjeto));
    } catch (e) {
      this.error.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene permiso para ver este documento.'
          : 'No se pudo cargar la vista previa.',
      );
    } finally {
      this.cargando.set(false);
    }
  }

  private liberarUrl(): void {
    if (this.urlObjeto) {
      URL.revokeObjectURL(this.urlObjeto);
      this.urlObjeto = null;
    }
  }
}
