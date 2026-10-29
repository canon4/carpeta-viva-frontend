import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Profesionales', descripcion: 'Defensor, psicosocial y nutricionista de cada menor.', fase: 1 },
  },
] satisfies Routes;
