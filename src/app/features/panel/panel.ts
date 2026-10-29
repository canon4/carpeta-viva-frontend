import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { MODULOS } from '../../core/navegacion';

@Component({
  selector: 'app-panel',
  imports: [RouterLink],
  template: `
    <h1>Panel</h1>
    <p>Bienvenido. Su rol es <strong>{{ auth.rol() }}</strong>.</p>
    <div class="rejilla">
      @for (m of visibles(); track m.ruta) {
        <a class="tarjeta" [routerLink]="'/' + m.ruta">
          <h2>{{ m.titulo }}</h2>
          <p>{{ m.descripcion }}</p>
        </a>
      }
    </div>
  `,
})
export class Panel {
  protected readonly auth = inject(AuthService);
  protected readonly visibles = computed(() => {
    const rol = this.auth.rol();
    return MODULOS.filter((m) => rol !== null && m.roles.includes(rol));
  });
}
