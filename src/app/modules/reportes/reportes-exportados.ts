import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { etiquetaNivel } from './opciones';
import { descargarBlob } from './descargas';

type InformeGenerado = components['schemas']['InformeGeneradoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Informes ya exportados. La descarga revalida el permiso vigente en el momento de descargar, no
 * solo el que existía al generar (ADR-0010 sección 2, corrección de seguridad): si el acceso ya
 * no es vigente (fin de asignación, permiso revocado, expediente archivado), el backend responde
 * 403/409 y aquí se muestra como aviso, no como error del sistema.
 */
@Component({
  selector: 'app-reportes-exportados',
  imports: [RouterLink],
  template: `
    <h1>Informes exportados</h1>
    <p><a routerLink="/reportes">Volver a Reportes</a></p>

    @if (cargando()) {
      <p class="nota">Cargando informes exportados...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (i of informes(); track i.id) {
        <li class="tarjeta">
          <p><strong>{{ etiquetaNivel(i.nivel) }}</strong> — formato {{ i.formato }}</p>
          <p>Generado: {{ i.generado_en }}</p>
          @if (mensajeDescarga()[i.id]) {
            <p class="nota" role="alert">{{ mensajeDescarga()[i.id] }}</p>
          }
          <button type="button" (click)="descargar(i)" [disabled]="descargandoId() === i.id">
            {{ descargandoId() === i.id ? 'Descargando...' : 'Descargar' }}
          </button>
        </li>
      }
      @if (!cargando() && informes().length === 0) {
        <p class="nota">Todavía no hay informes exportados.</p>
      }
    </ul>
  `,
})
export class ReportesExportados {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly etiquetaNivel = etiquetaNivel;

  protected readonly informes = signal<InformeGenerado[]>([]);
  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly descargandoId = signal<string | null>(null);
  protected readonly mensajeDescarga = signal<Record<string, string>>({});

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.informes.set(
        await firstValueFrom(this.http.get<InformeGenerado[]>(`${this.config.apiUrl}/reportes/exportados`)),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async descargar(i: InformeGenerado): Promise<void> {
    this.descargandoId.set(i.id);
    this.mensajeDescarga.set({ ...this.mensajeDescarga(), [i.id]: '' });
    try {
      const respuesta = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/reportes/exportados/${i.id}/contenido`, {
          responseType: 'blob',
          observe: 'response',
        }),
      );
      descargarBlob(respuesta as HttpResponse<Blob>, `informe-${i.nivel}-${i.id}.${i.formato}`);
    } catch (e) {
      const mensaje =
        e instanceof HttpErrorResponse && (e.status === 403 || e.status === 409)
          ? 'Su acceso a parte del contenido de este informe ya no es vigente (permiso revocado o expediente archivado). No se puede descargar.'
          : MENSAJE_GENERICO;
      this.mensajeDescarga.set({ ...this.mensajeDescarga(), [i.id]: mensaje });
    } finally {
      this.descargandoId.set(null);
    }
  }
}
