import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Reportes', descripcion: 'Reportes generales, por zona, por menor y por madre.', fase: 5 },
  },
] satisfies Routes;
