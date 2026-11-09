import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import { SelectorMenor } from '../../shared/selector-menor/selector-menor';
import type { components } from '../../core/api/schema';

type EvasionReportada = components['schemas']['EvasionReportadaOut'];

const MENSAJE_GENERICO = 'No se pudo registrar el reporte. Intente de nuevo o llame directamente a los números de emergencia.';

/**
 * Pantalla de emergencia: reportar la evasión de un menor. Al confirmarse, se muestran de
 * inmediato (sin clics adicionales, sin scroll oculto) los números de emergencia que devuelve
 * el backend en la misma respuesta: Policía de Infancia y Adolescencia (fijo) y los teléfonos del
 * defensor y la profesional psicosocial realmente asignados a este menor. Si a alguno le falta
 * teléfono registrado, se dice explícitamente — nunca se omite en silencio.
 */
@Component({
  selector: 'app-reportar-evasion',
  imports: [FormsModule, RouterLink, SelectorMenor],
  template: `
    <h1>Reportar evasión</h1>

    @if (!resultado()) {
      <p class="nota">
        Use este formulario para registrar que un menor salió del hogar sin autorización. Al
        confirmar, verá de inmediato en esta misma pantalla los números de emergencia.
      </p>

      <form class="formulario tarjeta" (ngSubmit)="reportar()" #f="ngForm">
        <app-selector-menor [(valor)]="menorId" [requerido]="true" />

        <label for="descripcion">Qué pasó (breve)</label>
        <textarea
          id="descripcion"
          name="descripcion"
          rows="4"
          required
          [(ngModel)]="descripcion"
          [disabled]="enviando()"
        ></textarea>

        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }

        <button type="submit" class="boton-emergencia" [disabled]="f.invalid || enviando()">
          {{ enviando() ? 'Registrando...' : 'Confirmar y reportar evasión ahora' }}
        </button>
      </form>
    } @else {
      <section class="tarjeta alerta-emergencia" role="alert" aria-live="assertive">
        <h2>Reporte registrado. Llame ya si hay riesgo inmediato</h2>

        <div class="contacto-emergencia">
          <p class="contacto-rol">Policía de Infancia y Adolescencia</p>
          <p class="contacto-telefono">{{ resultado()!.contactos_emergencia.policia_infancia_telefono }}</p>
        </div>

        @for (c of resultado()!.contactos_emergencia.contactos; track c.rol_asignado) {
          <div class="contacto-emergencia">
            <p class="contacto-rol">{{ etiquetaRol(c.rol_asignado) }}</p>
            <p>{{ c.nombres || 'Sin nombre registrado' }}</p>
            @if (c.telefono) {
              <p class="contacto-telefono">{{ c.telefono }}</p>
            } @else {
              <p class="error" role="alert">
                No tiene un teléfono registrado en el sistema. Busque otra vía para contactarlo de
                inmediato.
              </p>
            }
            @if (c.nota) {
              <p class="nota">{{ c.nota }}</p>
            }
          </div>
        }

        @if (!resultado()!.contactos_emergencia.contactos || resultado()!.contactos_emergencia.contactos!.length === 0) {
          <p class="error" role="alert">
            No hay defensor ni profesional psicosocial con teléfono resoluble para este menor. Use el
            número de Policía de Infancia y Adolescencia arriba y avise al coordinador de la zona de
            inmediato.
          </p>
        }
      </section>

      <section class="tarjeta">
        <h2>Alerta creada</h2>
        <p>Estado: {{ resultado()!.alerta.estado }}</p>
        <p>Descripción registrada: {{ resultado()!.alerta.descripcion }}</p>
        <p>
          La alerta ya llegó a la aplicación de las personas asignadas al caso. Puede revisar quién la
          ha visto en <a [routerLink]="['/alertas']" [queryParams]="{ menor_id: resultado()!.alerta.menor_id }">Alertas y Evasiones</a>.
        </p>
      </section>

      <button type="button" (click)="reiniciar()">Registrar otra evasión</button>
    }
  `,
  styles: [
    `
      .boton-emergencia {
        font-size: 1.1rem;
        padding: 0.9rem 1.2rem;
      }
      .alerta-emergencia {
        border: 3px solid #b00020;
      }
      .contacto-emergencia {
        margin: 0.75rem 0;
        padding: 0.5rem 0;
        border-bottom: 1px solid #ddd;
      }
      .contacto-rol {
        font-weight: bold;
        text-transform: uppercase;
      }
      .contacto-telefono {
        font-size: 1.4rem;
        font-weight: bold;
      }
    `,
  ],
})
export class ReportarEvasion {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);

  protected menorId = '';
  protected descripcion = '';

  protected readonly enviando = signal(false);
  protected readonly error = signal('');
  protected readonly resultado = signal<EvasionReportada | null>(null);

  constructor() {
    this.menorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
  }

  protected etiquetaRol(rol: string): string {
    if (rol === 'defensor') return 'Defensor asignado';
    if (rol === 'psicosocial') return 'Profesional psicosocial asignada';
    return rol;
  }

  protected async reportar(): Promise<void> {
    this.enviando.set(true);
    this.error.set('');
    try {
      const resultado = await firstValueFrom(
        this.http.post<EvasionReportada>(`${this.config.apiUrl}/alertas/evasion`, {
          menor_id: this.menorId,
          descripcion: this.descripcion,
        }),
      );
      this.resultado.set(resultado);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.enviando.set(false);
    }
  }

  protected reiniciar(): void {
    this.resultado.set(null);
    this.menorId = '';
    this.descripcion = '';
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para reportar la evasión de este menor.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
