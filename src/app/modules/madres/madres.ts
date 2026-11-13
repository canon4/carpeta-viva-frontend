import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth';
import { MadresCoordinador } from './madres-coordinador';
import { MadresPerfil } from './madres-perfil';

/** Muestra la vista de gestión (coordinador/admin) o la de perfil propio (madre) según el rol. */
@Component({
  selector: 'app-madres',
  imports: [MadresCoordinador, MadresPerfil],
  template: `
    <div class="modulo-container">
      <!-- Encabezado del Módulo con Identidad Visual Moderna -->
      <header class="modulo-header">
        <div class="titulo-con-icono">
          <div class="icono-titulo-wrapper">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </div>
          <div>
            <h1>Madres Sustitutas</h1>
            <p class="subtitulo">
              @if (auth.rol() === 'madre') {
                Gestión de su perfil personal, habilitaciones y capacitaciones
              } @else {
                Control, habilitación y seguimiento de madres sustitutas del programa
              }
            </p>
          </div>
        </div>
      </header>

      <!-- Contenedor de la Vista Dinámica según el Rol -->
      <main class="modulo-contenido-principal">
        @if (auth.rol() === 'madre') {
          <app-madres-perfil />
        } @else {
          <app-madres-coordinador />
        }
      </main>
    </div>
  `,
  styles: [`
    :host {
      --turquesa-principal: #18A999;
      --turquesa-oscuro: #0d7a6e;
      --turquesa-suave: #E3F5F1;
      --coral: #FF7F6B;
      --texto-principal: #344B49;
    }

    .modulo-container {
      display: flex;
      flex-direction: column;
      gap: 2rem;
      max-width: 1200px;
      margin: 0 auto;
      padding-bottom: 3rem;
    }

    /* Encabezado limpio y moderno */
    .modulo-header {
      background: #FFFFFF;
      border: 1px solid #e1e7ec;
      border-radius: 16px;
      padding: 1.75rem 2rem;
      box-shadow: 0 4px 12px rgb(0 0 0 / 0.02);
    }

    .titulo-con-icono {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .icono-titulo-wrapper {
      width: 48px;
      height: 48px;
      background: #FFF0ED; /* Fondo coral suave alusivo al módulo de madres/corazón */
      color: var(--coral);
      border-radius: 12px;
      display: grid;
      place-items: center;
      box-shadow: 0 4px 10px rgb(255 127 107 / 0.15);
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 800;
      color: var(--texto-principal);
      margin: 0 0 0.2rem 0;
      letter-spacing: -0.02em;
    }

    .subtitulo {
      color: var(--texto-principal);
      opacity: 0.7;
      font-size: 0.95rem;
      margin: 0;
    }

    /* Contenedor del componente hijo */
    .modulo-contenido-principal {
      background: #FFFFFF;
      border: 1px solid #e1e7ec;
      border-radius: 18px;
      padding: 2rem;
      box-shadow: 0 6px 20px rgb(0 0 0 / 0.02);
    }
  `]
})
export class Madres {
  protected readonly auth = inject(AuthService);
}
