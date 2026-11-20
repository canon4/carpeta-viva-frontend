import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { TIPOS_INFORME } from './opciones';
import { TextoIaPipe } from '../../shared/texto-ia.pipe';

type RedaccionApoyoCreate = components['schemas']['RedaccionApoyoCreate'];
type RedaccionApoyoOut = components['schemas']['RedaccionApoyoOut'];
type Menor = components['schemas']['MenorOut'];

/** Un pedido de borrador: las notas enviadas y el borrador que devolvió el asistente. */
interface Turno {
  clave: string;
  notas: string;
  menor: string;
  tipo: string;
  estado: 'cargando' | 'listo' | 'error';
  resultado: RedaccionApoyoOut | null;
  error: string;
  copiado: boolean;
}

const MENSAJE_GENERICO = 'No se pudo generar el borrador. Intente de nuevo.';

/**
 * Apoyo a la redacción (ADR-0010 sección 1.8) en forma de chat: el profesional escribe notas
 * sueltas y recibe un borrador con las mismas citas del flujo RAG. El asistente nunca guarda el
 * informe: el profesional debe revisarlo y copiarlo a Gestión Documental (RF12/ADR-0002 punto 6,
 * "la IA no decide, solo resume y apoya"). Los turnos viven solo en pantalla.
 */
@Component({
  selector: 'app-apoyo-redaccion',
  imports: [FormsModule, RouterLink, TextoIaPipe],
  template: `
    <div class="chat">
      <header class="chat__encabezado">
        <div class="chat__titulo">
          <span class="avatar avatar--ia" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
          </span>
          <div>
            <h1>Apoyo a la redacción</h1>
            <p class="nota">El borrador no se guarda: revíselo y guárdelo usted en Gestión Documental.</p>
          </div>
        </div>
        <div class="acciones-fila">
          <a class="boton-secundario enlace-boton" routerLink="/ia">Volver al asistente</a>
        </div>
      </header>

      <div class="chat__contexto">
        <label for="menorId" class="nota">Menor *</label>
        <select id="menorId" name="menorId" [(ngModel)]="menorId" [disabled]="generando() || cargandoMenores()">
          <option value="" disabled>Seleccione un menor</option>
          @for (m of menores(); track m.id) {
            <option [value]="m.id">{{ m.nombres }} {{ m.apellidos }}</option>
          }
        </select>
        <label for="tipoInforme" class="nota">Informe</label>
        <select id="tipoInforme" name="tipoInforme" [(ngModel)]="tipoInforme" [disabled]="generando()">
          @for (t of tipos; track t.valor) {
            <option [value]="t.valor">{{ t.etiqueta }}</option>
          }
        </select>
      </div>

      <div class="chat__hilo" #hilo role="log" aria-live="polite" aria-label="Borradores generados">
        @if (turnos().length === 0) {
          <div class="chat__vacio">
            <p><strong>Escriba sus notas como le salgan</strong></p>
            <p class="nota">
              Elija el menor y el tipo de informe arriba. El asistente ordena sus notas en un borrador y
              lo complementa con datos del expediente, citando de dónde salió cada uno.
            </p>
          </div>
        }
        @for (t of turnos(); track t.clave) {
          <div class="fila fila--usuario">
            <div class="burbuja burbuja--usuario">
              <span class="burbuja__etiqueta">{{ t.tipo }} · {{ t.menor }}</span>
              <p class="texto" [innerHTML]="t.notas | textoIa"></p>
            </div>
          </div>
          <div class="fila fila--ia">
            <span class="avatar avatar--ia avatar--chico" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/></svg>
            </span>
            <div class="burbuja burbuja--ia">
              @switch (t.estado) {
                @case ('cargando') {
                  <span class="escribiendo" role="status" aria-label="Generando el borrador"><i></i><i></i><i></i></span>
                }
                @case ('error') {
                  <p class="error">{{ t.error }}</p>
                }
                @default {
                  @if (t.resultado?.sin_resultado) {
                    <p class="nota">No encontré información con fuente para ampliar el borrador; se basa solo en sus notas.</p>
                  }
                  <p class="texto" [innerHTML]="t.resultado?.borrador | textoIa"></p>
                  @if ((t.resultado?.citas ?? []).length > 0) {
                    <details class="fuentes">
                      <summary>Fuentes ({{ t.resultado!.citas.length }})</summary>
                      <ol>
                        @for (c of t.resultado!.citas; track $index) {
                          <li>{{ c.categoria }} — {{ c.fecha }}: {{ c.texto }}</li>
                        }
                      </ol>
                    </details>
                  }
                  <div class="acciones-burbuja">
                    <button type="button" class="boton-secundario boton-chico" (click)="copiar(t)">Copiar borrador</button>
                    @if (t.copiado) {
                      <span class="exito" role="status">Copiado</span>
                    }
                  </div>
                }
              }
            </div>
          </div>
        }
      </div>

      @if (error()) {
        <p class="error chat__pie" role="alert">{{ error() }}</p>
      }
      <form class="chat__compositor" (ngSubmit)="generar()">
        <label for="notas" class="solo-lector">Sus notas</label>
        <textarea
          id="notas"
          name="notas"
          rows="2"
          [(ngModel)]="notasProfesional"
          (keydown.enter)="alPresionarEnter($event)"
          placeholder="Escriba lo que observó, sin preocuparse por el orden ni la redacción..."
        ></textarea>
        <button type="submit" class="enviar" [disabled]="!puedeGenerar()" aria-label="Generar borrador">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>
        </button>
      </form>
      <p class="nota chat__pie">Enter para generar, Mayús + Enter para una línea nueva.</p>
    </div>
  `,
})
export class ApoyoRedaccion {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly route = inject(ActivatedRoute);
  private readonly hilo = viewChild<ElementRef<HTMLElement>>('hilo');

  protected readonly tipos = TIPOS_INFORME;

  protected menorId = '';
  protected tipoInforme = TIPOS_INFORME[0].valor;
  protected notasProfesional = '';

  protected readonly menores = signal<Menor[]>([]);
  protected readonly cargandoMenores = signal(false);

  protected readonly generando = signal(false);
  protected readonly error = signal('');
  protected readonly turnos = signal<Turno[]>([]);
  private contador = 0;

  constructor() {
    this.menorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    void this.cargarMenores();
  }

  private async cargarMenores(): Promise<void> {
    this.cargandoMenores.set(true);
    try {
      this.menores.set(await firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`)));
    } catch {
      // El desplegable queda vacío; el profesional puede volver a intentar más tarde.
    } finally {
      this.cargandoMenores.set(false);
    }
  }

  protected puedeGenerar(): boolean {
    return !!this.menorId && !!this.notasProfesional.trim() && !this.generando();
  }

  protected alPresionarEnter(evento: Event): void {
    const tecla = evento as KeyboardEvent;
    if (tecla.shiftKey || tecla.isComposing) return;
    tecla.preventDefault();
    void this.generar();
  }

  protected async generar(): Promise<void> {
    if (!this.menorId) {
      this.error.set('Elija primero el menor sobre el que es el informe.');
      return;
    }
    if (!this.puedeGenerar()) return;
    this.error.set('');
    const menor = this.menores().find((m) => m.id === this.menorId);
    const turno: Turno = {
      clave: `t-${++this.contador}`,
      notas: this.notasProfesional.trim(),
      menor: menor ? `${menor.nombres} ${menor.apellidos}` : 'Menor',
      tipo: TIPOS_INFORME.find((t) => t.valor === this.tipoInforme)?.etiqueta ?? this.tipoInforme,
      estado: 'cargando',
      resultado: null,
      error: '',
      copiado: false,
    };
    this.notasProfesional = '';
    this.turnos.set([...this.turnos(), turno]);
    this.generando.set(true);
    this.bajar();
    try {
      const cuerpo: RedaccionApoyoCreate = {
        menor_id: this.menorId,
        tipo_informe: this.tipoInforme,
        notas_profesional: turno.notas,
      };
      const resultado = await firstValueFrom(
        this.http.post<RedaccionApoyoOut>(`${this.config.apiUrl}/ia/redaccion/apoyo`, cuerpo),
      );
      this.actualizar(turno.clave, { estado: 'listo', resultado });
    } catch (e) {
      this.actualizar(turno.clave, { estado: 'error', error: this.mensajeError(e) });
    } finally {
      this.generando.set(false);
      this.bajar();
    }
  }

  protected async copiar(t: Turno): Promise<void> {
    const borrador = t.resultado?.borrador;
    if (!borrador) return;
    try {
      await navigator.clipboard.writeText(borrador);
      this.actualizar(t.clave, { copiado: true });
    } catch {
      this.error.set('No se pudo copiar automáticamente. Selecciónelo y cópielo con el teclado.');
    }
  }

  private actualizar(clave: string, cambios: Partial<Turno>): void {
    this.turnos.set(this.turnos().map((t) => (t.clave === clave ? { ...t, ...cambios } : t)));
  }

  private bajar(): void {
    setTimeout(() => {
      const el = this.hilo()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'No tiene acceso al expediente de este menor.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
