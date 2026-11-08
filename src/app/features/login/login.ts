import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';

/**
 * Usuarios sintéticos de `backend/scripts/seed_sintetico.py`, no son un secreto real.
 * Los botones de acceso rápido solo se muestran si `config.json` activa
 * `accesosRapidosDesarrollo`, lo que nunca debe ocurrir en una URL pública.
 */
const ACCESOS_RAPIDOS: ReadonlyArray<{ etiqueta: string; email: string }> = [
  { etiqueta: 'Admin', email: 'admin@demo.local' },
  { etiqueta: 'Coordinador', email: 'coordinador@demo.local' },
  { etiqueta: 'Madre', email: 'madre@demo.local' },
  { etiqueta: 'Profesional', email: 'profesional@demo.local' },
  { etiqueta: 'Defensor', email: 'defensor@demo.local' },
  { etiqueta: 'Auditor', email: 'auditor@demo.local' },
];

const PASSWORD_DEMO = 'demo12345';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="centrado">
      <form class="tarjeta formulario" (ngSubmit)="entrar()" #f="ngForm">
        <h1>Iniciar sesión</h1>
        <label for="email">Correo</label>
        <input id="email" name="email" type="email" autocomplete="username" required [(ngModel)]="email" />
        <label for="password">Contraseña</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required [(ngModel)]="password" />
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" [disabled]="f.invalid || cargando()">
          {{ cargando() ? 'Entrando...' : 'Entrar' }}
        </button>
      </form>

      @if (mostrarAccesosRapidos) {
        <section class="tarjeta accesos-rapidos" aria-label="Accesos rápidos de desarrollo">
          <p>Solo en desarrollo local: entra con un usuario sintético de prueba.</p>
          <div class="fila-botones">
            @for (acceso of accesosRapidos; track acceso.email) {
              <button type="button" (click)="entrarRapido(acceso.email)" [disabled]="cargando()">
                {{ acceso.etiqueta }}
              </button>
            }
          </div>
        </section>
      }
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly config = inject(AppConfigService);

  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly cargando = signal(false);

  protected readonly accesosRapidos = ACCESOS_RAPIDOS;
  protected readonly mostrarAccesosRapidos = this.config.accesosRapidosDesarrollo;

  protected async entrar(): Promise<void> {
    await this.iniciarSesion(this.email, this.password);
  }

  /** Llena el formulario y envía el login real de inmediato (no se salta el backend). */
  protected async entrarRapido(email: string): Promise<void> {
    this.email = email;
    this.password = PASSWORD_DEMO;
    await this.iniciarSesion(email, PASSWORD_DEMO);
  }

  private async iniciarSesion(email: string, password: string): Promise<void> {
    this.error.set('');
    this.cargando.set(true);
    try {
      await this.auth.login(email, password);
      await this.router.navigate(['/panel']);
    } catch {
      this.error.set('Correo o contraseña incorrectos.');
    } finally {
      this.cargando.set(false);
    }
  }
}
