import { Component, inject } from '@angular/core';

import { AuthService } from '../../core/auth/auth';
import { MadresCoordinador } from './madres-coordinador';
import { MadresPerfil } from './madres-perfil';

/** Muestra la vista de gestión (coordinador/admin) o la de perfil propio (madre) según el rol. */
@Component({
  selector: 'app-madres',
  imports: [MadresCoordinador, MadresPerfil],
  template: `
    @if (auth.rol() === 'madre') {
      <app-madres-perfil />
    } @else {
      <app-madres-coordinador />
    }
  `,
})
export class Madres {
  protected readonly auth = inject(AuthService);
}
