import { HttpClient, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { descargarBlob } from './descargas';

type ExpedienteArchivo = components['schemas']['ExpedienteArchivoOut'];
type CerrarExpedienteRequest = components['schemas']['CerrarExpedienteRequest'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Estado de archivo de un menor y, para `coordinador`/`admin`, el botón de archivar (ADR-0010
 * sección 3). Archivar bloquea toda escritura futura sobre el expediente, por eso exige una
 * confirmación explícita con motivo obligatorio en vez de un botón directo. `auditor` ve el
 * estado pero nunca el botón de descargar el paquete (solo metadatos, mismo patrón que
 * documentos/ADR-0008).
 */
@Component({
  selector: 'app-archivo-menor',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Archivo y Cierre del expediente</h1>
    <p><a [routerLink]="['/menores', menorId]">Volver al expediente</a></p>

    @if (cargando()) {
      <p class="nota">Cargando estado del archivo...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (estado()) {
      <section class="tarjeta">
        @if (estado()!.estado === 'archivado') {
          <p><strong>Este expediente está archivado.</strong></p>
          <p>Archivado el: {{ estado()!.archivado_en }}</p>
          <p>Motivo: {{ estado()!.motivo || 'Sin motivo registrado' }}</p>
          <p>Destino: {{ estado()!.destino }}</p>
          @if (estado()!.paquete_hash) {
            <p>Hash del paquete (verificación de integridad): {{ estado()!.paquete_hash }}</p>
          }
          @if (puedeDescargarPaquete()) {
            <button type="button" (click)="descargarPaquete()" [disabled]="descargando()">
              {{ descargando() ? 'Descargando...' : 'Descargar paquete cifrado' }}
            </button>
          } @else if (esAuditor()) {
            <p class="nota">El rol auditor solo ve estos metadatos; el paquete no está disponible para descarga.</p>
          }
        } @else {
          <p>Este expediente todavía no está archivado.</p>

          @if (puedeArchivar()) {
            @if (!mostrarConfirmacion()) {
              <button type="button" (click)="mostrarConfirmacion.set(true)">Archivar expediente</button>
            } @else {
              <form class="formulario tarjeta alerta-archivo" (ngSubmit)="confirmarArchivo()" #f="ngForm">
                <h2>Confirme el archivo de este expediente</h2>
                <p class="nota">
                  Al archivar, nadie podrá crear documentos, informes, alertas ni citas nuevas para
                  este menor. No se borra nada; esta acción no se puede deshacer desde la pantalla.
                </p>
                <label for="motivo">Motivo del cierre (obligatorio)</label>
                <input id="motivo" name="motivo" required [(ngModel)]="motivo" [disabled]="archivando()" />
                <button type="submit" [disabled]="f.invalid || archivando()">
                  {{ archivando() ? 'Archivando...' : 'Sí, archivar definitivamente' }}
                </button>
                <button type="button" (click)="cancelarConfirmacion()" [disabled]="archivando()">Cancelar</button>
              </form>
            }
          }
        }
      </section>
    }
  `,
  styles: [
    `
      .alerta-archivo {
        border: 2px solid #b00020;
      }
    `,
  ],
})
export class ArchivoMenor {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  protected readonly menorId = inject(ActivatedRoute).snapshot.paramMap.get('menorId') ?? '';

  protected readonly cargando = signal(true);
  protected readonly error = signal('');
  protected readonly estado = signal<ExpedienteArchivo | null>(null);

  protected readonly mostrarConfirmacion = signal(false);
  protected motivo = '';
  protected readonly archivando = signal(false);

  protected readonly descargando = signal(false);

  protected readonly esAuditor = computed(() => this.auth.rol() === 'auditor');
  protected readonly puedeArchivar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });
  protected readonly puedeDescargarPaquete = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      this.estado.set(
        await firstValueFrom(this.http.get<ExpedienteArchivo>(`${this.config.apiUrl}/archivo/menores/${this.menorId}`)),
      );
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  protected cancelarConfirmacion(): void {
    this.mostrarConfirmacion.set(false);
    this.motivo = '';
  }

  protected async confirmarArchivo(): Promise<void> {
    this.archivando.set(true);
    this.error.set('');
    try {
      const cuerpo: CerrarExpedienteRequest = { motivo: this.motivo };
      this.estado.set(
        await firstValueFrom(
          this.http.post<ExpedienteArchivo>(`${this.config.apiUrl}/archivo/menores/${this.menorId}/cerrar`, cuerpo),
        ),
      );
      this.mostrarConfirmacion.set(false);
      this.motivo = '';
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.archivando.set(false);
    }
  }

  protected async descargarPaquete(): Promise<void> {
    this.descargando.set(true);
    this.error.set('');
    try {
      const respuesta = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/archivo/menores/${this.menorId}/paquete`, {
          responseType: 'blob',
          observe: 'response',
        }),
      );
      descargarBlob(respuesta as HttpResponse<Blob>, `archivo-${this.menorId}.zip`);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.descargando.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'No tiene permiso sobre el archivo de este expediente (verifique que sea de su zona).';
      if (error.status === 409) return 'Este expediente no cumple todavía la condición para archivarse (debe estar egresado o fallecido, sin asignación vigente).';
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
