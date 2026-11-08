import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { TIPOS_INFORME } from './opciones';

type RedaccionApoyoCreate = components['schemas']['RedaccionApoyoCreate'];
type RedaccionApoyoOut = components['schemas']['RedaccionApoyoOut'];

const MENSAJE_GENERICO = 'No se pudo generar el borrador. Intente de nuevo.';

/**
 * Apoyo a la redacción (ADR-0010 sección 1.8): el profesional escribe notas sueltas y recibe un
 * borrador con las mismas citas del flujo RAG. El asistente nunca guarda el informe: el
 * profesional debe revisarlo y copiarlo manualmente a Gestión Documental (RF12/ADR-0002 punto 6,
 * "la IA no decide, solo resume y apoya").
 */
@Component({
  selector: 'app-apoyo-redaccion',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Apoyo a la redacción</h1>
    <p><a routerLink="/ia">Volver al asistente de IA</a></p>
    <p class="nota">
      Este borrador no se guarda en ningún lado. Cópielo, revíselo y guárdelo usted mismo como
      informe en Gestión Documental.
    </p>

    <form class="formulario tarjeta" (ngSubmit)="generar()" #f="ngForm">
      <label for="menorId">Id del menor</label>
      <input id="menorId" name="menorId" required [(ngModel)]="menorId" [disabled]="generando()" />

      <label for="tipoInforme">Tipo de informe</label>
      <select id="tipoInforme" name="tipoInforme" required [(ngModel)]="tipoInforme" [disabled]="generando()">
        @for (t of tipos; track t.valor) {
          <option [value]="t.valor">{{ t.etiqueta }}</option>
        }
      </select>

      <label for="notas">Sus notas (texto libre)</label>
      <textarea
        id="notas"
        name="notas"
        rows="5"
        required
        [(ngModel)]="notasProfesional"
        [disabled]="generando()"
        placeholder="Escriba aquí lo que observó, sin preocuparse por el orden ni la redacción final."
      ></textarea>

      <button type="submit" [disabled]="f.invalid || generando()">
        {{ generando() ? 'Generando borrador...' : 'Generar borrador' }}
      </button>
    </form>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (resultado()) {
      <section class="tarjeta">
        <h2>Borrador</h2>
        @if (resultado()!.sin_resultado) {
          <p class="nota">
            No se encontró información adicional con fuente para ampliar el borrador; use solo sus
            propias notas.
          </p>
        }
        <p style="white-space: pre-wrap">{{ resultado()!.borrador }}</p>
        <button type="button" (click)="copiar()">Copiar borrador</button>
        @if (copiado()) {
          <p class="exito" role="status">Borrador copiado.</p>
        }

        <h3>Fuentes citadas</h3>
        <ul class="lista-simple">
          @for (c of resultado()!.citas; track $index) {
            <li>{{ c.categoria }} — {{ c.fecha }}: {{ c.texto }}</li>
          }
          @if (resultado()!.citas.length === 0) {
            <li class="nota">No se citó ninguna fuente concreta.</li>
          }
        </ul>
      </section>
    }
  `,
})
export class ApoyoRedaccion {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);

  protected readonly tipos = TIPOS_INFORME;

  protected menorId = '';
  protected tipoInforme = TIPOS_INFORME[0].valor;
  protected notasProfesional = '';

  protected readonly generando = signal(false);
  protected readonly error = signal('');
  protected readonly resultado = signal<RedaccionApoyoOut | null>(null);
  protected readonly copiado = signal(false);

  constructor() {
    this.menorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
  }

  protected async generar(): Promise<void> {
    this.generando.set(true);
    this.error.set('');
    this.copiado.set(false);
    try {
      const cuerpo: RedaccionApoyoCreate = {
        menor_id: this.menorId,
        tipo_informe: this.tipoInforme,
        notas_profesional: this.notasProfesional,
      };
      this.resultado.set(
        await firstValueFrom(this.http.post<RedaccionApoyoOut>(`${this.config.apiUrl}/ia/redaccion/apoyo`, cuerpo)),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.generando.set(false);
    }
  }

  protected async copiar(): Promise<void> {
    const borrador = this.resultado()?.borrador;
    if (!borrador) return;
    try {
      await navigator.clipboard.writeText(borrador);
      this.copiado.set(true);
    } catch {
      this.error.set('No se pudo copiar automáticamente. Selecciónelo y cópielo con el teclado.');
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'No tiene acceso al expediente de este menor.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
