import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { MODULOS } from '../../core/navegacion';
import { IaFlotante } from '../../shared/ia-flotante/ia-flotante';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, IaFlotante],
  template: `
    <header class="barra">
      <button type="button" class="menu" (click)="menuAbierto.set(!menuAbierto())" [attr.aria-expanded]="menuAbierto()">
        Menú
      </button>
      <span class="marca">Carpeta Viva</span>
      <span class="usuario">{{ auth.usuario()?.email }} ({{ auth.rol() }})</span>
      <button type="button" (click)="auth.logout()">Salir</button>
    </header>
    <div class="contenedor">
      <nav class="lateral" [class.abierto]="menuAbierto()" aria-label="Módulos">
        <a routerLink="/panel" routerLinkActive="activo" (click)="menuAbierto.set(false)">Panel</a>
        @for (m of visibles(); track m.ruta) {
          <a [routerLink]="'/' + m.ruta" routerLinkActive="activo" (click)="menuAbierto.set(false)">{{ m.titulo }}</a>
        }
      </nav>
      <main class="contenido"><router-outlet /></main>
    </div>
    <app-ia-flotante />
  `,
})
export class Shell {
  protected readonly auth = inject(AuthService);
  protected readonly menuAbierto = signal(false);
  protected readonly visibles = computed(() => {
    const rol = this.auth.rol();
    return MODULOS.filter((m) => rol !== null && m.roles.includes(rol));
  });
}
