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
const ACCESOS_RAPIDOS: ReadonlyArray<{ etiqueta: string; email: string; icono: string }> = [
  { 
    etiqueta: 'Admin', 
    email: 'admin@demo.local',
    icono: 'M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 3a2 2 0 1 1-2 2 2 2 0 0 1 2-2zm0 14.2a7.2 7.2 0 0 1-5.5-2.5c.1-1.8 3.7-2.7 5.5-2.7s5.4.9 5.5 2.7a7.2 7.2 0 0 1-5.5 2.5z'
  },
  { 
    etiqueta: 'Coordinador', 
    email: 'coordinador@demo.local',
    icono: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm6-4h4m-2-2v4'
  },
  { 
    etiqueta: 'Madre', 
    email: 'madre@demo.local',
    icono: 'M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z'
  },
  { 
    etiqueta: 'Profesional', 
    email: 'profesional@demo.local',
    icono: 'M22 10v6M2 10v6m10-10l10 5-10 5L2 15l10-5z'
  },
  { 
    etiqueta: 'Defensor', 
    email: 'defensor@demo.local',
    icono: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z'
  },
  { 
    etiqueta: 'Auditor', 
    email: 'auditor@demo.local',
    icono: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6m-4 5H8m8 4H8m2-8H8'
  },
];

const PASSWORD_DEMO = 'demo12345';

@Component({
  selector: 'app-login',
  imports: [FormsModule],
  template: `
    <main class="login-container">
      <!-- Panel visual izquierdo con VIKA HOME -->
      <section class="login-brand-panel">
        <div class="brand-content">
          <div class="badge-bienvenida">Plataforma Digital</div>
          <h1>
            <span class="brand-title-main">VIKA</span>
            <span class="brand-title-sub">HOME</span>
          </h1>
          <p>Plataforma inteligente para el seguimiento, bienestar y protección integral con tecnología moderna.</p>
        </div>
        <div class="brand-circles">
          <div class="circle c1"></div>
          <div class="circle c2"></div>
        </div>
      </section>

      <!-- Panel derecho con el formulario -->
      <section class="login-form-panel">
        <div class="form-wrapper">
          <form class="formulario" (ngSubmit)="entrar()" #f="ngForm">
            <div class="login-header">
              <div class="titulo-con-icono">
                <svg class="icono-titulo" xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <h2>Bienvenido</h2>
              </div>
              <p class="nota">Ingresa tus credenciales para continuar</p>
            </div>

            <div class="campo-grupo">
              <label for="email">Correo electrónico</label>
              <input id="email" name="email" type="email" autocomplete="username" placeholder="tu&#64;correo.com" required [(ngModel)]="email" />
            </div>

            <div class="campo-grupo">
              <label for="password">Contraseña</label>
              <input id="password" name="password" type="password" autocomplete="current-password" placeholder="••••••••" required [(ngModel)]="password" />
            </div>

            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }

            <button type="submit" [disabled]="f.invalid || cargando()">
              {{ cargando() ? 'Verificando...' : 'Iniciar Sesión' }}
            </button>
          </form>

          @if (mostrarAccesosRapidos) {
            <section class="accesos-rapidos" aria-label="Accesos rápidos de desarrollo">
              <p class="nota-dev">⚡ Accesos rápidos de desarrollo</p>
              <div class="fila-botones">
                @for (acceso of accesosRapidos; track acceso.email) {
                  <button type="button" class="btn-secundario" (click)="entrarRapido(acceso.email)" [disabled]="cargando()" [title]="'Entrar como ' + acceso.etiqueta">
                    <svg class="icono-btn" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                      <path [attr.d]="acceso.icono"/>
                    </svg>
                    <span>{{ acceso.etiqueta }}</span>
                  </button>
                }
              </div>
            </section>
          }
        </div>
      </section>
    </main>
  `,
  styles: [`
    :host {
      --turquesa-principal: #18A999;
      --turquesa-suave: #E3F5F1;
      --coral: #FF7F6B;
      --coral-suave: #FFF0ED;
      --amarillo: #FFC857;
      --amarillo-suave: #FFF5DC;
      --fondo-menu: #F2F7F6;
      --texto-principal: #344B49;
    }

    .login-container {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 1.1fr 0.9fr;
      background: #FFFFFF;
    }

    @media (max-width: 950px) {
      .login-container {
        grid-template-columns: 1fr;
      }
      .login-brand-panel {
        display: none !important;
      }
    }

    /* Panel izquierdo decorativo */
    .login-brand-panel {
      background: linear-gradient(135deg, #18A999 0%, #0d7a6e 100%);
      position: relative;
      overflow: hidden;
      display: flex;
      align-items: center;
      padding: 4rem;
      color: #FFFFFF;
    }

    .brand-content {
      position: relative;
      z-index: 2;
      max-width: 480px;
    }

    .badge-bienvenida {
      display: inline-block;
      background: rgba(255, 255, 255, 0.2);
      padding: 0.35rem 0.85rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      margin-bottom: 1.25rem;
      backdrop-filter: blur(4px);
    }

    .login-brand-panel h1 {
      font-size: 3.5rem;
      line-height: 1.1;
      margin-bottom: 1rem;
      letter-spacing: -0.02em;
    }

    .brand-title-main {
      font-weight: 900;
    }

    .brand-title-sub {
      font-weight: 300;
      opacity: 0.85;
      margin-left: 0.25rem;
      letter-spacing: 0.05em;
    }

    .login-brand-panel p {
      font-size: 1.1rem;
      line-height: 1.6;
      opacity: 0.9;
      margin: 0;
    }

    .brand-circles .circle {
      position: absolute;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.07);
    }
    .brand-circles .c1 {
      width: 400px;
      height: 400px;
      top: -100px;
      left: -100px;
    }
    .brand-circles .c2 {
      width: 300px;
      height: 300px;
      bottom: -80px;
      right: -80px;
    }

    /* Panel derecho */
    .login-form-panel {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: var(--fondo-menu);
      overflow-y: auto;
    }

    .form-wrapper {
      width: 100%;
      max-width: 440px;
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .formulario {
      background: #FFFFFF;
      border: 1px solid var(--turquesa-suave);
      border-radius: 20px;
      padding: 2.2rem 2rem;
      box-shadow: 0 15px 35px -5px rgb(24 169 153 / 0.08), 0 5px 15px rgb(0 0 0 / 0.03);
      display: grid;
      gap: 1.1rem;
    }

    .login-header {
      margin-bottom: 0.2rem;
    }

    .titulo-con-icono {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 0.35rem;
    }

    .icono-titulo {
      color: var(--turquesa-principal);
    }

    .login-header h2 {
      color: var(--texto-principal);
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0;
    }

    .nota {
      color: var(--texto-principal);
      opacity: 0.7;
      font-size: 0.9rem;
      margin: 0;
    }

    .campo-grupo {
      display: grid;
      gap: 0.35rem;
      text-align: left;
    }

    .campo-grupo label {
      font-size: 0.85rem;
      font-weight: 600;
      color: var(--texto-principal);
    }

    input {
      font: inherit;
      min-height: 46px;
      border-radius: 12px;
      border: 1.5px solid #d1dedb;
      background: var(--turquesa-suave);
      padding: 0 1rem;
      color: var(--texto-principal);
      transition: all 0.2s ease;
    }

    input:focus {
      border-color: var(--turquesa-principal);
      background: #FFFFFF;
      box-shadow: 0 0 0 4px rgb(24 169 153 / 0.15);
      outline: none;
    }

    button[type="submit"] {
      background: #18A999 !important;
      color: #ffffff !important;
      font-weight: 600;
      font-size: 0.95rem;
      min-height: 46px;
      border-radius: 12px;
      border: none !important;
      cursor: pointer;
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgb(24 169 153 / 0.25);
      margin-top: 0.3rem;
    }

    button[type="submit"]:hover:not(:disabled) {
      background: #148f81 !important;
      transform: translateY(-1px);
      box-shadow: 0 6px 18px rgb(24 169 153 / 0.35);
    }

    button:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }

    .error {
      color: var(--coral);
      background: var(--coral-suave);
      padding: 0.6rem 0.85rem;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 500;
      text-align: center;
      margin: 0;
    }

    .accesos-rapidos {
      background: #FFFFFF;
      padding: 1rem 1.25rem;
      border: 1px dashed var(--amarillo);
      border-radius: 16px;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.02);
    }

    .nota-dev {
      font-size: 0.75rem;
      font-weight: 600;
      color: #b38624;
      margin: 0 0 0.6rem 0;
      text-align: center;
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .fila-botones {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
      justify-content: center;
    }

    .btn-secundario {
      background: var(--turquesa-suave) !important;
      color: var(--texto-principal) !important;
      border: 1px solid transparent !important;
      font-size: 0.75rem;
      font-weight: 600;
      padding: 0.35rem 0.65rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
      display: flex;
      align-items: center;
      gap: 0.35rem;
    }

    .icono-btn {
      color: var(--turquesa-principal);
      flex-shrink: 0;
    }

    .btn-secundario:hover:not(:disabled) {
      background: #18A999 !important;
      color: #ffffff !important;
    }

    .btn-secundario:hover:not(:disabled) .icono-btn {
      color: #ffffff !important;
    }
  `]
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