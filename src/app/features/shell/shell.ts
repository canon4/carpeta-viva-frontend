import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { MODULOS } from '../../core/navegacion';
import { IaFlotante } from '../../shared/ia-flotante/ia-flotante';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IaFlotante],
  template: `
    <!-- Barra Superior / Header Moderno -->
    <header class="barra">
      <div class="barra-izquierda">
        <button type="button" class="btn-menu" (click)="menuAbierto.set(!menuAbierto())" [attr.aria-expanded]="menuAbierto()" title="Abrir menú">
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>
        <div class="marca-container">
          <span class="marca-main">VIKA</span>
          <span class="marca-sub">HOME</span>
        </div>
      </div>

      <div class="barra-derecha">
        <div class="usuario-info">
          <div class="avatar-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <span class="usuario-texto">
            <strong>{{ auth.usuario()?.email }}</strong> 
            <span class="rol-pill">{{ auth.rol() }}</span>
          </span>
        </div>
        <button type="button" class="btn-salir" (click)="auth.logout()" title="Cerrar sesión">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
            <polyline points="16 17 21 12 16 7"></polyline>
            <line x1="21" y1="12" x2="9" y2="12"></line>
          </svg>
          <span>Salir</span>
        </button>
      </div>
    </header>

    <!-- Contenedor Principal con Menú Lateral -->
    <div class="contenedor">
      <nav class="lateral" [class.abierto]="menuAbierto()" aria-label="Módulos">
        <a routerLink="/panel" routerLinkActive="activo" [routerLinkActiveOptions]="{exact: true}" (click)="menuAbierto.set(false)">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="7" height="9" x="3" y="3" rx="1"/>
            <rect width="7" height="5" x="14" y="3" rx="1"/>
            <rect width="7" height="9" x="14" y="12" rx="1"/>
            <rect width="7" height="5" x="3" y="16" rx="1"/>
          </svg>
          <span>Panel de Control</span>
        </a>

        @for (m of visibles(); track m.ruta) {
          <a [routerLink]="'/' + m.ruta" routerLinkActive="activo" (click)="menuAbierto.set(false)">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            <span>{{ m.titulo }}</span>
          </a>
        }
      </nav>

      <main class="contenido">
        <router-outlet />
      </main>
    </div>

    <app-ia-flotante />
  `,
  styles: [`
    :host {
      --turquesa-principal: #18A999;
      --turquesa-oscuro: #0d7a6e;
      --turquesa-suave: #E3F5F1;
      --coral: #FF7F6B;
      --fondo-app: #F2F7F6;
      --texto-principal: #344B49;
      display: block;
      min-height: 100vh;
      background: var(--fondo-app);
      font-family: inherit;
    }

    /* Barra Superior */
    .barra {
      background: #FFFFFF;
      height: 70px;
      padding: 0 1.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid #e1e7ec;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 2px 10px rgb(0 0 0 / 0.02);
    }

    .barra-izquierda {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .btn-menu {
      background: var(--turquesa-suave);
      color: var(--turquesa-principal);
      border: none;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .btn-menu:hover {
      background: var(--turquesa-principal);
      color: #ffffff;
    }

    .marca-container {
      display: flex;
      align-items: baseline;
      font-size: 1.35rem;
      letter-spacing: -0.02em;
    }

    .marca-main {
      font-weight: 900;
      color: var(--texto-principal);
    }

    .marca-sub {
      font-weight: 300;
      color: var(--turquesa-principal);
      margin-left: 0.2rem;
      letter-spacing: 0.05em;
    }

    .barra-derecha {
      display: flex;
      align-items: center;
      gap: 1.25rem;
    }

    .usuario-info {
      display: flex;
      align-items: center;
      gap: 0.65rem;
      background: var(--fondo-app);
      padding: 0.35rem 0.85rem;
      border-radius: 20px;
      border: 1px solid #d8e3e0;
    }

    .avatar-icon {
      color: var(--turquesa-principal);
      display: grid;
      place-items: center;
    }

    .usuario-texto {
      font-size: 0.875rem;
      color: var(--texto-principal);
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .rol-pill {
      background: var(--turquesa-principal);
      color: #ffffff;
      font-size: 0.7rem;
      font-weight: 700;
      padding: 0.1rem 0.5rem;
      border-radius: 6px;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }

    .btn-salir {
      background: #FFF0ED;
      color: var(--coral);
      border: 1px solid #ffd4cc;
      padding: 0.5rem 0.85rem;
      border-radius: 10px;
      font-size: 0.875rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 0.4rem;
      transition: all 0.2s ease;
    }

    .btn-salir:hover {
      background: var(--coral);
      color: #ffffff;
    }

    /* Estructura del Contenedor y Sidebar */
    .contenedor {
      display: flex;
      min-height: calc(100vh - 70px);
    }

    .lateral {
      width: 280px;
      background: #FFFFFF;
      border-right: 1px solid #e1e7ec;
      padding: 1.5rem 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
      transition: transform 0.3s ease;
      z-index: 90;
    }

    .lateral a {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      padding: 0.75rem 1rem;
      color: var(--texto-principal);
      text-decoration: none;
      font-weight: 500;
      font-size: 0.95rem;
      border-radius: 12px;
      transition: all 0.2s ease;
    }

    .lateral a svg {
      color: #7b928e;
      transition: color 0.2s ease;
    }

    .lateral a:hover {
      background: var(--turquesa-suave);
      color: var(--turquesa-oscuro);
    }

    .lateral a:hover svg {
      color: var(--turquesa-principal);
    }

    .lateral a.activo {
      background: var(--turquesa-principal);
      color: #ffffff;
      font-weight: 600;
      box-shadow: 0 4px 12px rgb(24 169 153 / 0.25);
    }

    .lateral a.activo svg {
      color: #ffffff;
    }

    /* Área de Contenido */
    .contenido {
      flex: 1;
      padding: 2rem;
      overflow-y: auto;
    }

    /* Diseño responsivo para móviles */
    @media (max-width: 900px) {
      .lateral {
        position: fixed;
        top: 70px;
        left: 0;
        bottom: 0;
        transform: translateX(-100%);
        box-shadow: 10px 0 25px rgb(0 0 0 / 0.05);
      }

      .lateral.abierto {
        transform: translateX(0);
      }

      .usuario-info strong {
        display: none; /* Oculta el correo largo en pantallas pequeñas, dejando solo el rol */
      }
    }
  `]
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly menuAbierto = signal(false);
  protected readonly visibles = computed(() => {
    const rol = this.auth.rol();
    return MODULOS.filter((m) => rol !== null && m.roles.includes(rol));
  });
}