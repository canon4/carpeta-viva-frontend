import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { GRUPOS, ICONOS, MODULOS, type ModuloNav } from '../../core/navegacion';
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
        <a routerLink="/perfil" routerLinkActive="activo" class="usuario-info" title="Ver mi perfil">
          <div class="avatar-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
          </div>
          <span class="usuario-texto">
            <strong>Mi perfil</strong>
            <span class="rol-pill">{{ auth.rol() }}</span>
          </span>
        </a>
        <button type="button" class="btn-salir" (click)="auth.logout()" title="Cerrar sesión" aria-label="Cerrar sesión">
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
          <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="iconos['panel']" /></svg>
          <span>Panel de control</span>
        </a>

        @for (g of grupos(); track g.id) {
          <div class="grupo">
            <button
              type="button"
              class="grupo-titulo"
              [attr.aria-expanded]="estaAbierto(g.id)"
              [attr.aria-controls]="'grupo-' + g.id"
              (click)="alternar(g.id)"
            >
              <span>{{ g.titulo }}</span>
              <svg aria-hidden="true" class="flecha" [class.girada]="estaAbierto(g.id)" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            @if (estaAbierto(g.id)) {
              <div class="grupo-items" [id]="'grupo-' + g.id">
                @for (m of g.modulos; track m.ruta) {
                  <a [routerLink]="'/' + m.ruta" routerLinkActive="activo" (click)="menuAbierto.set(false)">
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="iconos[m.ruta]" /></svg>
                    <span>{{ m.titulo }}</span>
                  </a>
                }
              </div>
            }
          </div>
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
      text-decoration: none;
      color: inherit;
    }

    .usuario-info:hover {
      background: var(--turquesa-suave);
    }

    .usuario-info:focus-visible {
      outline: 3px solid var(--turquesa-oscuro);
      outline-offset: 2px;
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
      background: var(--turquesa-oscuro);
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
      color: #A8321F; /* coral oscuro: el coral claro sobre este fondo no llegaba a 4.5:1 */
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
      background: #A8321F;
      color: #ffffff;
    }

    /* Estructura del Contenedor y Sidebar */
    .contenedor {
      display: flex;
      min-height: calc(100vh - 70px);
    }

    /* Menú lateral fijo: se queda en su sitio mientras se desplaza el contenido del módulo. */
    .lateral {
      width: 260px;
      flex-shrink: 0;
      background: #FFFFFF;
      border-right: 1px solid #e1e7ec;
      padding: 1rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      position: sticky;
      top: 70px;
      align-self: flex-start;
      height: calc(100vh - 70px);
      overflow-y: auto;
      overscroll-behavior: contain;
      transition: transform 0.3s ease;
      z-index: 90;
    }

    .grupo { display: flex; flex-direction: column; margin-top: 0.5rem; }

    .grupo-titulo {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 0 1rem;
      background: transparent;
      color: #4f6461;
      border: none;
      border-radius: 10px;
      font-size: 0.78rem;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .grupo-titulo:hover { background: var(--fondo-app); }
    .grupo-titulo:focus-visible, .lateral a:focus-visible { outline: 3px solid var(--turquesa-oscuro); outline-offset: 2px; }

    .flecha { transition: transform 0.2s ease; }
    .flecha.girada { transform: rotate(90deg); }

    .grupo-items { display: flex; flex-direction: column; gap: 0.2rem; }

    @media (prefers-reduced-motion: reduce) {
      .flecha, .lateral, .lateral a { transition: none; }
    }

    .lateral a {
      display: flex;
      align-items: center;
      gap: 0.85rem;
      min-height: 44px;
      padding: 0.6rem 1rem;
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
      /* Turquesa oscuro: el blanco sobre el turquesa claro no llegaba al contraste 4.5:1. */
      background: var(--turquesa-oscuro);
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
      min-width: 0;
      padding: 2rem;
    }

    /* Diseño responsivo para móviles: el menú pasa a ser un cajón que se abre con el botón. */
    @media (max-width: 900px) {
      .lateral {
        position: fixed;
        top: 70px;
        left: 0;
        bottom: 0;
        height: auto;
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

    @media (max-width: 520px) {
      .barra { padding: 0 0.75rem; }
      .barra-derecha { gap: 0.5rem; }
      .btn-salir span { display: none; }
      .btn-salir { min-width: 44px; min-height: 44px; justify-content: center; padding: 0; }
    }
  `]
})
export class Shell {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly iconos = ICONOS;
  protected readonly menuAbierto = signal(false);
  private readonly abiertos = signal<Record<string, boolean>>({});

  /** Grupos con los módulos que el rol puede ver; los grupos vacíos no se muestran. */
  protected readonly grupos = computed(() => {
    const rol = this.auth.rol();
    return GRUPOS.map((g) => ({
      ...g,
      modulos: g.rutas
        .map((r) => MODULOS.find((m) => m.ruta === r))
        .filter((m): m is ModuloNav => !!m && rol !== null && m.roles.includes(rol)),
    })).filter((g) => g.modulos.length > 0);
  });

  constructor() {
    // El grupo del módulo actual se abre solo, también al entrar por un enlace directo.
    this.abrirGrupoDe(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe((e) => this.abrirGrupoDe(e.urlAfterRedirects));
  }

  protected estaAbierto(id: string): boolean {
    return this.abiertos()[id] ?? false;
  }

  protected alternar(id: string): void {
    this.abiertos.update((a) => ({ ...a, [id]: !this.estaAbierto(id) }));
  }

  private abrirGrupoDe(url: string): void {
    const ruta = url.split(/[/?#]/).filter(Boolean)[0] ?? '';
    const grupo = GRUPOS.find((g) => g.rutas.includes(ruta));
    if (grupo && !this.estaAbierto(grupo.id)) {
      this.abiertos.update((a) => ({ ...a, [grupo.id]: true }));
    }
  }
}