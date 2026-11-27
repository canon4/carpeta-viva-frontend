import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, firstValueFrom, map } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import type { Rol } from '../../core/navegacion';
import { TextoIaPipe } from '../texto-ia.pipe';

type ConsultaCreate = components['schemas']['ConsultaCreate'];
type ConsultaOut = components['schemas']['ConsultaOut'];

interface Intercambio {
  clave: string;
  pregunta: string;
  cargando: boolean;
  error: string;
  respuesta: ConsultaOut | null;
}

const MENSAJE_GENERICO = 'No se pudo completar la consulta. Intente de nuevo.';
const ROLES_CON_IA: Rol[] = ['madre', 'profesional', 'defensor', 'coordinador', 'admin'];

/**
 * Chat flotante disponible en cualquier pantalla (montado en el Shell). Usa el mismo endpoint, las
 * mismas reglas y la misma vista de chat que la página completa en /ia (ADR-0010 sección 1): solo
 * busca entre lo que el usuario puede ver, siempre cita la fuente y no llama al modelo externo sin
 * una fuente. En /ia se oculta porque el chat completo ya está abierto.
 */
@Component({
  selector: 'app-ia-flotante',
  imports: [FormsModule, RouterLink, TextoIaPipe],
  template: `
    @if (visible()) {
      <div class="ia-flotante">
        @if (abierto()) {
          <section class="chat chat--flotante" role="dialog" aria-label="Asistente de IA">
            <header class="chat__encabezado">
              <div class="chat__titulo">
                <span class="avatar avatar--ia avatar--chico" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z"/></svg>
                </span>
                <strong>Asistente de IA</strong>
              </div>
              <div class="ia-flotante__acciones">
                <a routerLink="/ia" (click)="abierto.set(false)" class="ia-flotante__icono" aria-label="Abrir en pantalla completa" title="Abrir en pantalla completa">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/></svg>
                </a>
                <button type="button" class="ia-flotante__icono" (click)="abierto.set(false)" aria-label="Cerrar" title="Cerrar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                </button>
              </div>
            </header>

            <div class="chat__hilo" #hilo role="log" aria-live="polite">
              @if (intercambios().length === 0) {
                <div class="chat__vacio">
                  <p><strong>¿En qué le ayudo?</strong></p>
                  <p class="nota">Solo busco en lo que usted puede ver y siempre cito la fuente.</p>
                  <div class="sugerencias">
                    @for (s of sugerencias; track s) {
                      <button type="button" class="chip" (click)="preguntar(s)">{{ s }}</button>
                    }
                  </div>
                </div>
              }
              @for (i of intercambios(); track i.clave) {
                <div class="fila fila--usuario">
                  <div class="burbuja burbuja--usuario"><p>{{ i.pregunta }}</p></div>
                </div>
                <div class="fila fila--ia">
                  <div class="burbuja burbuja--ia">
                    @if (i.cargando) {
                      <span class="escribiendo" role="status" aria-label="El asistente está buscando"><i></i><i></i><i></i></span>
                    } @else if (i.error) {
                      <p class="error">{{ i.error }}</p>
                    } @else if (i.respuesta?.sin_resultado) {
                      <p class="texto" [innerHTML]="i.respuesta.respuesta | textoIa"></p>
                      <p class="nota">No envié la pregunta al asistente externo.</p>
                    } @else if (i.respuesta) {
                      <p class="texto" [innerHTML]="i.respuesta.respuesta | textoIa"></p>
                      @if (fragmentosDe(i.respuesta).length > 0) {
                        <details class="fuentes">
                          <summary>Fuentes ({{ fragmentosDe(i.respuesta).length }})</summary>
                          <ol>
                            @for (f of fragmentosDe(i.respuesta); track $index) {
                              <li>
                                @if (rutaFragmento(f)) {
                                  <a [routerLink]="rutaFragmento(f)" (click)="abierto.set(false)">{{ textoFragmento(f) }}</a>
                                } @else {
                                  {{ textoFragmento(f) }}
                                }
                              </li>
                            }
                          </ol>
                        </details>
                      }
                    }
                  </div>
                </div>
              }
            </div>

            <form class="chat__compositor" (ngSubmit)="preguntar()">
              <label for="iaFlotantePregunta" class="solo-lector">Su pregunta</label>
              <textarea
                id="iaFlotantePregunta"
                name="iaFlotantePregunta"
                rows="1"
                [(ngModel)]="pregunta"
                (keydown.enter)="alPresionarEnter($event)"
                placeholder="Escriba su pregunta..."
              ></textarea>
              <button type="submit" class="enviar" [disabled]="!pregunta.trim() || enviando()" aria-label="Enviar pregunta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/></svg>
              </button>
            </form>
            <p class="nota chat__pie">Enter para enviar · Mayús + Enter, línea nueva</p>
          </section>
        }

        <button
          type="button"
          class="ia-flotante__boton"
          (click)="alternar()"
          [attr.aria-expanded]="abierto()"
          [attr.aria-label]="abierto() ? 'Cerrar asistente de IA' : 'Abrir asistente de IA'"
        >
          @if (abierto()) {
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
          } @else {
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          }
        </button>
      </div>
    }
  `,
  styles: [`
    .ia-flotante { position: fixed; right: 1rem; bottom: 1rem; z-index: 50; display: flex; flex-direction: column; align-items: flex-end; gap: 0.75rem; }
    .ia-flotante__boton {
      width: 3.5rem; height: 3.5rem; border-radius: 50%; padding: 0; display: grid; place-items: center;
      box-shadow: 0 6px 18px rgba(13, 122, 110, 0.35);
    }
    .chat--flotante {
      width: min(24rem, calc(100vw - 2rem)); height: min(34rem, calc(100dvh - 10.5rem)); min-height: 0; margin: 0;
      box-shadow: 0 12px 32px rgba(29, 39, 51, 0.18); border-radius: 1rem;
    }
    .chat--flotante .chat__encabezado { padding: 0.5rem 0.5rem 0.5rem 0.75rem; flex-wrap: nowrap; }
    .chat--flotante .chat__titulo { gap: 0.5rem; }
    .chat--flotante .chat__hilo { padding: 0.75rem; }
    .chat--flotante .chat__compositor { padding: 0.5rem 0.75rem 0.25rem; }
    .chat--flotante .burbuja { max-width: 90%; font-size: 0.95rem; }
    .chat--flotante .chip { min-height: 36px; font-size: 0.9rem; }
    .ia-flotante__acciones { display: flex; gap: 0.25rem; }
    .ia-flotante__icono {
      display: grid; place-items: center; width: 2.5rem; height: 2.5rem; min-height: 0; padding: 0; border: none; border-radius: 50%;
      background: transparent; color: var(--color-texto);
    }
    .ia-flotante__icono:hover:not(:disabled) { background: var(--color-primario-suave); color: var(--color-primario); }
    .ia-flotante__icono svg { width: 1.2rem; height: 1.2rem; }
  `],
})
export class IaFlotante {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly hilo = viewChild<ElementRef<HTMLElement>>('hilo');

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly visible = computed(() => {
    const rol = this.auth.rol();
    const enPaginaIa = /^\/ia(\/|\?|$)/.test(this.url());
    return rol !== null && ROLES_CON_IA.includes(rol) && !enPaginaIa;
  });

  protected readonly sugerencias = ['¿Cuándo fue la última cita médica?', '¿Qué documentos faltan por revisar?'];

  protected readonly abierto = signal(false);
  protected readonly enviando = signal(false);
  protected readonly intercambios = signal<Intercambio[]>([]);
  protected pregunta = '';
  private contador = 0;

  protected alternar(): void {
    this.abierto.set(!this.abierto());
    if (this.abierto()) this.bajar();
  }

  protected alPresionarEnter(evento: Event): void {
    const tecla = evento as KeyboardEvent;
    if (tecla.shiftKey || tecla.isComposing) return;
    tecla.preventDefault();
    void this.preguntar();
  }

  protected async preguntar(texto?: string): Promise<void> {
    const pregunta = (texto ?? this.pregunta).trim();
    if (!pregunta || this.enviando()) return;
    this.pregunta = '';
    const intercambio: Intercambio = { clave: `f-${++this.contador}`, pregunta, cargando: true, error: '', respuesta: null };
    this.intercambios.set([...this.intercambios(), intercambio]);
    this.enviando.set(true);
    this.bajar();
    try {
      const cuerpo: ConsultaCreate = { pregunta, menor_id: null, hogar_id: null };
      const respuesta = await firstValueFrom(this.http.post<ConsultaOut>(`${this.config.apiUrl}/ia/consultas`, cuerpo));
      this.actualizar(intercambio.clave, { cargando: false, respuesta });
    } catch (e) {
      this.actualizar(intercambio.clave, { cargando: false, error: this.mensajeError(e) });
    } finally {
      this.enviando.set(false);
      this.bajar();
    }
  }

  private actualizar(clave: string, cambios: Partial<Intercambio>): void {
    this.intercambios.set(this.intercambios().map((i) => (i.clave === clave ? { ...i, ...cambios } : i)));
  }

  private bajar(): void {
    setTimeout(() => {
      const el = this.hilo()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  protected fragmentosDe(c: ConsultaOut): Record<string, unknown>[] {
    return (c.fragmentos_usados ?? []) as Record<string, unknown>[];
  }

  protected textoFragmento(f: Record<string, unknown>): string {
    const titulo = typeof f['titulo'] === 'string' ? f['titulo'] : '';
    const categoria = typeof f['categoria'] === 'string' ? f['categoria'] : '';
    const fecha = typeof f['fecha'] === 'string' ? f['fecha'] : '';
    const modulo = typeof f['modulo'] === 'string' ? f['modulo'] : '';
    const detalle = [categoria, fecha, modulo].filter(Boolean).join(' — ');
    if (titulo) return detalle ? `${titulo} (${detalle})` : titulo;
    if (typeof f['texto'] === 'string') return f['texto'];
    return detalle || 'Fuente citada sin detalle';
  }

  /** Ruta del frontend donde se encuentra la fuente citada (p. ej. `/documentos/{id}`), o null
   * si esta fuente no tiene una pantalla propia enlazable. */
  protected rutaFragmento(f: Record<string, unknown>): string | null {
    return typeof f['ruta'] === 'string' && f['ruta'] ? f['ruta'] : null;
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta consulta.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
