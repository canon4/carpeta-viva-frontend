import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Usuario = components['schemas']['UsuarioOut'];
type Madre = components['schemas']['MadreOut'];
type Profesional = components['schemas']['ProfesionalOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';
const TAMANO_MAXIMO = 5 * 1024 * 1024; // 5 MB, aviso de cliente; la validación real la hace el backend.

const ETIQUETAS_ROL: Record<string, string> = {
  madre: 'Madre sustituta',
  profesional: 'Profesional',
  defensor: 'Defensor de familia',
  coordinador: 'Coordinador',
  admin: 'Administrador',
  auditor: 'Auditor',
};

/**
 * Perfil propio, para los 6 roles (ADR-0019): avatar, nombre completo, rol, correo, foto propia
 * y los datos de contacto que cada rol puede editar sobre sí mismo.
 */
@Component({
  selector: 'app-perfil',
  imports: [FormsModule],
  template: `
    <div class="encabezado-modulo">
      <h1>Mi perfil</h1>
    </div>

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (exito()) {
      <p class="exito" role="status">{{ exito() }}</p>
    }
    @if (cargando()) {
      <p class="nota" role="status">Cargando perfil...</p>
    } @else {
      <div class="tarjeta tarjeta-perfil">
        <div class="avatar-grande">
          @if (urlFoto()) {
            <img [src]="urlFoto()" alt="Foto de perfil" />
          } @else {
            <svg aria-hidden="true" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          }
        </div>
        <div class="datos-perfil">
          <h2>{{ nombreCompleto() }}</h2>
          <p class="nota">{{ etiquetaRol() }}</p>
          <p class="nota">{{ auth.usuario()?.email }}</p>
        </div>
      </div>

      <section class="seccion">
        <h2>Foto de perfil</h2>
        <p class="nota">Se usa para que otras personas del sistema puedan identificarla a usted.</p>
        @if (errorFoto()) {
          <p class="error" role="alert">{{ errorFoto() }}</p>
        }
        <form class="campos" (ngSubmit)="subirFoto()">
          <div class="campo">
            <label for="archivoFoto">Tomar o subir foto</label>
            <input
              id="archivoFoto"
              name="archivoFoto"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="user"
              (change)="seleccionarFoto($event)"
            />
          </div>
          <div class="acciones">
            <button type="submit" [disabled]="!archivoSeleccionado() || subiendoFoto()">
              {{ subiendoFoto() ? 'Subiendo...' : 'Guardar foto' }}
            </button>
          </div>
        </form>
      </section>

      <section class="seccion">
        <h2>Mis datos</h2>

        @if (auth.rol() === 'madre') {
          <form class="panel-formulario" (ngSubmit)="guardarMadre()" #fm="ngForm" aria-label="Mis datos de contacto">
            <div class="campos">
              <div class="campo">
                <label for="direccionMadre">Dirección</label>
                <input id="direccionMadre" name="direccionMadre" autocomplete="off" [(ngModel)]="formMadre.direccion" />
              </div>
              <div class="campo">
                <label for="telefonoMadre">Teléfono</label>
                <input id="telefonoMadre" name="telefonoMadre" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="formMadre.telefono" />
              </div>
            </div>
            <div class="acciones">
              <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </form>
        } @else if (auth.rol() === 'profesional' || auth.rol() === 'defensor') {
          <form class="panel-formulario" (ngSubmit)="guardarProfesional()" #fp="ngForm" aria-label="Mis datos de contacto">
            <div class="campos">
              <div class="campo">
                <label for="telefonoProf">Teléfono</label>
                <input id="telefonoProf" name="telefonoProf" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="formProfesional.telefono" />
              </div>
              <div class="campo">
                <label for="especialidadProf">Especialidad</label>
                <input id="especialidadProf" name="especialidadProf" autocomplete="off" [(ngModel)]="formProfesional.especialidad" />
              </div>
            </div>
            <div class="acciones">
              <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </form>
        } @else {
          <form class="panel-formulario" (ngSubmit)="guardarUsuario()" #fu="ngForm" aria-label="Mi nombre">
            <div class="campos">
              <div class="campo">
                <label for="nombresUsuario">Nombres</label>
                <input id="nombresUsuario" name="nombresUsuario" autocomplete="off" [(ngModel)]="formUsuario.nombres" />
              </div>
              <div class="campo">
                <label for="apellidosUsuario">Apellidos</label>
                <input id="apellidosUsuario" name="apellidosUsuario" autocomplete="off" [(ngModel)]="formUsuario.apellidos" />
              </div>
            </div>
            <div class="acciones">
              <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
            </div>
          </form>
        }
      </section>
    }
  `,
  styles: [
    `
      .tarjeta-perfil { display: flex; flex-wrap: wrap; align-items: center; gap: 1.25rem; margin-bottom: 1.5rem; }
      .avatar-grande {
        width: 6rem;
        height: 6rem;
        border-radius: 50%;
        background: var(--color-primario-suave);
        color: var(--color-primario);
        display: grid;
        place-items: center;
        overflow: hidden;
        flex: none;
      }
      .avatar-grande img { width: 100%; height: 100%; object-fit: cover; }
      .datos-perfil h2 { margin: 0; }
      .datos-perfil p { margin: 0.15rem 0; }
    `,
  ],
})
export class Perfil implements OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  protected readonly auth = inject(AuthService);

  protected readonly cargando = signal(true);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');

  protected readonly madre = signal<Madre | null>(null);
  protected readonly profesional = signal<Profesional | null>(null);

  protected readonly urlFoto = signal<string | null>(null);
  protected readonly errorFoto = signal('');
  protected readonly archivoSeleccionado = signal<File | null>(null);
  protected readonly subiendoFoto = signal(false);

  protected formMadre = { direccion: '', telefono: '' };
  protected formProfesional = { telefono: '', especialidad: '' };
  protected formUsuario = { nombres: '', apellidos: '' };

  protected readonly nombreCompleto = computed(() => {
    const rol = this.auth.rol();
    if (rol === 'madre') {
      const m = this.madre();
      return m ? `${m.nombres} ${m.apellidos}` : '—';
    }
    if (rol === 'profesional' || rol === 'defensor') {
      const p = this.profesional();
      return p ? `${p.nombres} ${p.apellidos}` : '—';
    }
    const u = this.auth.usuario();
    const nombre = [u?.nombres, u?.apellidos].filter(Boolean).join(' ').trim();
    return nombre || 'Sin nombre registrado';
  });

  protected etiquetaRol(): string {
    const rol = this.auth.rol();
    return rol ? ETIQUETAS_ROL[rol] ?? rol : '—';
  }

  constructor() {
    void this.cargar();
  }

  ngOnDestroy(): void {
    const url = this.urlFoto();
    if (url) URL.revokeObjectURL(url);
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const rol = this.auth.rol();
      if (rol === 'madre') {
        const m = await firstValueFrom(this.http.get<Madre>(`${this.config.apiUrl}/madres/yo`));
        this.madre.set(m);
        this.formMadre = { direccion: m.direccion ?? '', telefono: m.telefono ?? '' };
      } else if (rol === 'profesional' || rol === 'defensor') {
        const p = await firstValueFrom(this.http.get<Profesional>(`${this.config.apiUrl}/profesionales/yo`));
        this.profesional.set(p);
        this.formProfesional = { telefono: p.telefono ?? '', especialidad: p.especialidad ?? '' };
      } else {
        const u = this.auth.usuario();
        this.formUsuario = { nombres: u?.nombres ?? '', apellidos: u?.apellidos ?? '' };
      }
      if (this.auth.usuario()?.tiene_foto) {
        await this.cargarFoto();
      }
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.cargando.set(false);
    }
  }

  private async cargarFoto(): Promise<void> {
    try {
      const blob = await firstValueFrom(
        this.http.get(`${this.config.apiUrl}/auth/yo/foto`, { responseType: 'blob' }),
      );
      const anterior = this.urlFoto();
      if (anterior) URL.revokeObjectURL(anterior);
      this.urlFoto.set(URL.createObjectURL(blob));
    } catch {
      // Sin foto o error al leerla: se muestra el ícono genérico, sin bloquear el resto del perfil.
    }
  }

  protected seleccionarFoto(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    this.errorFoto.set('');
    if (archivo && !archivo.type.startsWith('image/')) {
      this.errorFoto.set('Elija un archivo de imagen (JPEG, PNG o WEBP).');
      this.archivoSeleccionado.set(null);
      return;
    }
    if (archivo && archivo.size > TAMANO_MAXIMO) {
      this.errorFoto.set('La imagen es muy grande. Use una de 5 MB o menos.');
      this.archivoSeleccionado.set(null);
      return;
    }
    this.archivoSeleccionado.set(archivo);
  }

  protected async subirFoto(): Promise<void> {
    const archivo = this.archivoSeleccionado();
    if (!archivo) return;
    this.subiendoFoto.set(true);
    this.errorFoto.set('');
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      await firstValueFrom(this.http.put(`${this.config.apiUrl}/auth/yo/foto`, datos));
      this.auth.usuario.update((u) => (u ? { ...u, tiene_foto: true } : u));
      this.archivoSeleccionado.set(null);
      await this.cargarFoto();
      this.exito.set('Foto de perfil actualizada.');
    } catch (e) {
      this.errorFoto.set(this.mensajeError(e));
    } finally {
      this.subiendoFoto.set(false);
    }
  }

  protected async guardarMadre(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Madre>(`${this.config.apiUrl}/madres/yo`, {
          direccion: this.formMadre.direccion || null,
          telefono: this.formMadre.telefono || null,
        }),
      );
      this.madre.set(actualizado);
      this.exito.set('Datos actualizados.');
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async guardarProfesional(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Profesional>(`${this.config.apiUrl}/profesionales/yo`, {
          telefono: this.formProfesional.telefono || null,
          especialidad: this.formProfesional.especialidad || null,
        }),
      );
      this.profesional.set(actualizado);
      this.exito.set('Datos actualizados.');
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected async guardarUsuario(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    this.exito.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Usuario>(`${this.config.apiUrl}/auth/yo`, {
          nombres: this.formUsuario.nombres || null,
          apellidos: this.formUsuario.apellidos || null,
        }),
      );
      this.auth.usuario.set(actualizado);
      this.exito.set('Datos actualizados.');
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para editar este dato.';
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
