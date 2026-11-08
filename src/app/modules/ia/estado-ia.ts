import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type EstadoIaDatos = components['schemas']['EstadoIaOut'];

const MENSAJE_GENERICO = 'No se pudo cargar la configuración del asistente.';

/**
 * Configuración activa del asistente de IA (ADR-0010 sección 1.9, solo `admin`): proveedor,
 * modelo, modo anonimizado/real y cobertura de seudonimización, sin exponer la clave. Transparencia
 * de configuración, no un panel de edición.
 */
@Component({
  selector: 'app-estado-ia',
  imports: [RouterLink],
  template: `
    <h1>Configuración del asistente de IA</h1>
    <p><a routerLink="/ia">Volver al asistente de IA</a></p>

    @if (cargando()) {
      <p class="nota">Cargando configuración...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (estado()) {
      <section class="tarjeta">
        <p>Proveedor del modelo de lenguaje: {{ estado()!.proveedor_llm }}</p>
        <p>Modelo de lenguaje: {{ estado()!.modelo_llm }}</p>
        <p>Modelo de embeddings: {{ estado()!.embeddings_modelo }}</p>
        <p>Anonimizado por defecto: {{ estado()!.anonimizado_por_defecto ? 'Sí' : 'No' }}</p>
        <p>Indexación automática al cargar documentos: {{ estado()!.indexar_automaticamente ? 'Sí' : 'No' }}</p>
        <p>Cobertura de seudonimización: {{ estado()!.seudonimizacion_cobertura }}</p>
      </section>
    }
  `,
})
export class EstadoIa {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly estado = signal<EstadoIaDatos | null>(null);

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      this.estado.set(await firstValueFrom(this.http.get<EstadoIaDatos>(`${this.config.apiUrl}/ia/estado`)));
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }
}
