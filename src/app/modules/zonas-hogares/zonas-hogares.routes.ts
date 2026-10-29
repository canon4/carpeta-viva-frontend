import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Zonas y Hogares', descripcion: 'Zonas y hogares sustitutos con los datos de cada hogar.', fase: 1 },
  },
] satisfies Routes;
