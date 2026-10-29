import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Madres Sustitutas', descripcion: 'Perfil, habilitación, capacitaciones y firma única.', fase: 1 },
  },
] satisfies Routes;
