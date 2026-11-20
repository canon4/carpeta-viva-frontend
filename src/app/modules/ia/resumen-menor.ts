import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { TextoIaPipe } from '../../shared/texto-ia.pipe';

type ResumenMenorDatos = components['schemas']['ResumenMenorOut'];

const MENSAJE_GENERICO = 'No se pudo generar el resumen. Intente de nuevo.';

/**
 * Resumen de IA del expediente de un menor (ADR-0010 sección 1.9), enlazado desde el expediente.
 * Aplica `tiene_permiso_seccion` antes de incluir cualquier fuente sensible: si no hay nada
 * accesible todavía, se dice explícitamente en vez de mostrar un resumen vacío como error.
 * Se presenta con la misma vista de chat del asistente.
 */
@Component({
  selector: 'app-resumen-menor',
  imports: [RouterLink, TextoIaPipe],
  template: `
    <div class="chat">
      <header class="chat__encabezado">
        <div class="chat__titulo">
          <span class="avatar avatar--ia" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/></svg>
          </span>
          <div>
            <h1>Resumen del expediente</h1>
            <p class="nota">Solo incluye lo que usted puede ver, con la fuente de cada dato.</p>
          </div>
        </div>
        <div class="acciones-fila">
          <a class="boton-secundario enlace-boton" [routerLink]="['/menores', menorId]">Volver al expediente</a>
        </div>
      </header>

      <div class="chat__hilo" aria-live="polite" aria-label="Resumen generado por el asistente">
        <div class="fila fila--usuario">
          <div class="burbuja burbuja--usuario"><p>Resuma el expediente de este menor.</p></div>
        </div>
        <div class="fila fila--ia">
          <span class="avatar avatar--ia avatar--chico" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/></svg>
          </span>
          <div class="burbuja burbuja--ia">
            @if (cargando()) {
              <span class="escribiendo" role="status" aria-label="Generando el resumen"><i></i><i></i><i></i></span>
            } @else if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
              <div class="acciones-burbuja">
                <button type="button" class="boton-secundario boton-chico" (click)="cargar()">Reintentar</button>
              </div>
            } @else if (resumen(); as r) {
              @if (r.sin_resultado) {
                <p class="nota">Todavía no hay suficiente información con fuente confiable para resumir este expediente.</p>
              } @else {
                <p class="texto" [innerHTML]="r.resumen | textoIa"></p>
                @if (r.citas.length > 0) {
                  <details class="fuentes">
                    <summary>Fuentes ({{ r.citas.length }})</summary>
                    <ol>
                      @for (c of r.citas; track $index) {
                        <li>{{ c.categoria }} — {{ c.fecha }}: {{ c.texto }}</li>
                      }
                    </ol>
                  </details>
                } @else {
                  <p class="nota">Sin fuente concreta citada.</p>
                }
              }
              <div class="acciones-burbuja">
                <button type="button" class="boton-secundario boton-chico" (click)="cargar()">Generar de nuevo</button>
                <a class="boton-secundario enlace-boton boton-chico" routerLink="/ia" [queryParams]="{ menor_id: menorId }">Preguntar sobre este menor</a>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ResumenMenor {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  protected readonly menorId = inject(ActivatedRoute).snapshot.paramMap.get('menorId') ?? '';

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly resumen = signal<ResumenMenorDatos | null>(null);

  constructor() {
    void this.cargar();
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.resumen.set(
        await firstValueFrom(
          this.http.get<ResumenMenorDatos>(`${this.config.apiUrl}/ia/menores/${this.menorId}/resumen`),
        ),
      );
    } catch (e) {
      this.error.set(
        e instanceof HttpErrorResponse && e.status === 403 ? 'No tiene acceso al expediente de este menor.' : MENSAJE_GENERICO,
      );
    } finally {
      this.cargando.set(false);
    }
  }
}
