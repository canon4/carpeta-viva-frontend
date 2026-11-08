import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type ResumenMenorDatos = components['schemas']['ResumenMenorOut'];

const MENSAJE_GENERICO = 'No se pudo generar el resumen. Intente de nuevo.';

/**
 * Resumen de IA del expediente de un menor (ADR-0010 sección 1.9), enlazado desde el expediente.
 * Aplica `tiene_permiso_seccion` antes de incluir cualquier fuente sensible: si no hay nada
 * accesible todavía, se dice explícitamente en vez de mostrar un resumen vacío como error.
 */
@Component({
  selector: 'app-resumen-menor',
  imports: [RouterLink],
  template: `
    <h1>Resumen de IA del expediente</h1>
    <p><a [routerLink]="['/menores', menorId]">Volver al expediente</a></p>

    @if (cargando()) {
      <p class="nota">Generando resumen...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (resumen()) {
      <section class="tarjeta">
        @if (resumen()!.sin_resultado) {
          <p class="nota">
            No hay todavía suficiente información con fuente confiable para generar un resumen de
            este expediente.
          </p>
        } @else {
          <p>{{ resumen()!.resumen }}</p>
          <h2>Fuentes citadas</h2>
          <ul class="lista-simple">
            @for (c of resumen()!.citas; track $index) {
              <li>{{ c.categoria }} — {{ c.fecha }}: {{ c.texto }}</li>
            }
            @if (resumen()!.citas.length === 0) {
              <li class="nota">No se citó ninguna fuente concreta.</li>
            }
          </ul>
        }
      </section>
    }
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

  private async cargar(): Promise<void> {
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
