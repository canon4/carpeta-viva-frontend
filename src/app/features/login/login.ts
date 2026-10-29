import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AuthService } from '../../core/auth/auth';

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
    </main>
  `,
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected email = '';
  protected password = '';
  protected readonly error = signal('');
  protected readonly cargando = signal(false);

  protected async entrar(): Promise<void> {
    this.error.set('');
    this.cargando.set(true);
    try {
      await this.auth.login(this.email, this.password);
      await this.router.navigate(['/panel']);
    } catch {
      this.error.set('Correo o contraseña incorrectos.');
    } finally {
      this.cargando.set(false);
    }
  }
}
