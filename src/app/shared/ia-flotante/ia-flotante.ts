import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import type { Rol } from '../../core/navegacion';

type ConsultaCreate = components['schemas']['ConsultaCreate'];
type ConsultaOut = components['schemas']['ConsultaOut'];

interface Intercambio {
  pregunta: string;
  cargando: boolean;
  error: string;
  respuesta: ConsultaOut | null;
}

const MENSAJE_GENERICO = 'No se pudo completar la consulta. Intente de nuevo.';
const ROLES_CON_IA: Rol[] = ['madre', 'profesional', 'defensor', 'coordinador', 'admin'];

/**
 * Chat flotante disponible en cualquier pantalla (montado en el Shell). Usa el mismo endpoint y
 * las mismas reglas que la página completa en /ia (ADR-0010 sección 1): solo busca entre lo que
 * el usuario puede ver, siempre cita la fuente, y no llama al modelo externo sin una fuente.
 */
@Component({
  selector: 'app-ia-flotante',
  imports: [FormsModule, RouterLink],
  template: `
    @if (visible()) {
      <div class="ia-flotante">
        @if (abierto()) {
          <section class="ia-flotante__panel tarjeta" role="dialog" aria-label="Asistente de IA">
            <header class="ia-flotante__encabezado">
              <strong>Asistente de IA</strong>
              <button type="button" class="ia-flotante__cerrar" (click)="abierto.set(false)" aria-label="Cerrar">✕</button>
            </header>

            <div class="ia-flotante__hilo">
              @if (intercambios().length === 0) {
                <p class="nota">
                  Pregunte en palabras sencillas. Solo se busca entre lo que usted puede ver y siempre
                  se cita la fuente.
                </p>
              }
              @for (i of intercambios(); track $index) {
                <p class="ia-flotante__burbuja ia-flotante__burbuja--pregunta">{{ i.pregunta }}</p>
                <div class="ia-flotante__burbuja ia-flotante__burbuja--respuesta">
                  @if (i.cargando) {
                    <p class="nota">Buscando...</p>
                  } @else if (i.error) {
                    <p class="error" role="alert">{{ i.error }}</p>
                  } @else if (i.respuesta?.sin_resultado) {
                    <p class="nota">
                      No se encontró información con una fuente confiable. No se envió la pregunta al
                      asistente externo.
                    </p>
                  } @else if (i.respuesta) {
                    <p>{{ i.respuesta!.respuesta }}</p>
                    @if (fragmentosDe(i.respuesta!).length > 0) {
                      <ul class="lista-simple">
                        @for (f of fragmentosDe(i.respuesta!); track $index) {
                          <li class="nota">{{ textoFragmento(f) }}</li>
                        }
                      </ul>
                    }
                  }
                </div>
              }
            </div>

            <p><a routerLink="/ia" (click)="abierto.set(false)">Ver historial completo</a></p>

            <form class="ia-flotante__formulario" (ngSubmit)="preguntar()" #f="ngForm">
              <label for="iaFlotantePregunta" class="nota">Su pregunta</label>
              <textarea
                id="iaFlotantePregunta"
                name="iaFlotantePregunta"
                rows="2"
                required
                [(ngModel)]="pregunta"
                [disabled]="enviando()"
                placeholder="Ejemplo: ¿Cuándo fue la última visita médica de este menor?"
              ></textarea>
              <button type="submit" [disabled]="f.invalid || enviando()">
                {{ enviando() ? 'Enviando...' : 'Preguntar' }}
              </button>
            </form>
          </section>
        }

        <button
          type="button"
          class="ia-flotante__boton"
          (click)="abierto.set(!abierto())"
          [attr.aria-expanded]="abierto()"
          aria-label="Asistente de IA"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 4h16v12H8l-4 4V4z" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </button>
      </div>
    }
  `,
  styles: [`
    .ia-flotante { position: fixed; right: 1rem; bottom: 1rem; z-index: 50; display: flex; flex-direction: column; align-items: flex-end; gap: 0.5rem; }
    .ia-flotante__boton { width: var(--tamano-tactil); height: var(--tamano-tactil); border-radius: 50%; padding: 0; display: grid; place-items: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25); }
    .ia-flotante__panel { width: min(22rem, calc(100vw - 2rem)); max-height: min(32rem, calc(100vh - 6rem)); display: flex; flex-direction: column; gap: 0.5rem; padding: 0.75rem; }
    .ia-flotante__encabezado { display: flex; align-items: center; justify-content: space-between; }
    .ia-flotante__cerrar { min-height: 2rem; min-width: 2rem; padding: 0; background: transparent; color: var(--color-texto); border: none; }
    .ia-flotante__hilo { overflow-y: auto; display: grid; gap: 0.5rem; flex: 1; }
    .ia-flotante__burbuja { margin: 0; padding: 0.5rem 0.75rem; border-radius: var(--radio); max-width: 90%; }
    .ia-flotante__burbuja--pregunta { align-self: flex-end; background: var(--color-primario); color: var(--color-primario-texto); }
    .ia-flotante__burbuja--respuesta { align-self: flex-start; background: var(--color-fondo); border: 1px solid var(--color-borde); }
    .ia-flotante__formulario { display: grid; gap: 0.25rem; }
  `],
})
export class IaFlotante {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  protected readonly visible = computed(() => {
    const rol = this.auth.rol();
    return rol !== null && ROLES_CON_IA.includes(rol);
  });

  protected readonly abierto = signal(false);
  protected readonly enviando = signal(false);
  protected readonly intercambios = signal<Intercambio[]>([]);
  protected pregunta = '';

  protected async preguntar(): Promise<void> {
    const pregunta = this.pregunta.trim();
    if (!pregunta) return;
    this.pregunta = '';
    const intercambio: Intercambio = { pregunta, cargando: true, error: '', respuesta: null };
    this.intercambios.set([...this.intercambios(), intercambio]);
    this.enviando.set(true);
    try {
      const cuerpo: ConsultaCreate = { pregunta, menor_id: null, hogar_id: null };
      const respuesta = await firstValueFrom(this.http.post<ConsultaOut>(`${this.config.apiUrl}/ia/consultas`, cuerpo));
      this.actualizar(intercambio, { cargando: false, respuesta });
    } catch (e) {
      this.actualizar(intercambio, { cargando: false, error: this.mensajeError(e) });
    } finally {
      this.enviando.set(false);
    }
  }

  private actualizar(objetivo: Intercambio, cambios: Partial<Intercambio>): void {
    this.intercambios.set(this.intercambios().map((i) => (i === objetivo ? { ...i, ...cambios } : i)));
  }

  protected fragmentosDe(c: ConsultaOut): Record<string, unknown>[] {
    return (c.fragmentos_usados ?? []) as Record<string, unknown>[];
  }

  protected textoFragmento(f: Record<string, unknown>): string {
    if (typeof f['texto'] === 'string') return f['texto'];
    const categoria = typeof f['categoria'] === 'string' ? f['categoria'] : '';
    const fecha = typeof f['fecha'] === 'string' ? f['fecha'] : '';
    const texto = [categoria, fecha].filter(Boolean).join(' — ');
    return texto || 'Fuente citada sin detalle';
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta consulta.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
