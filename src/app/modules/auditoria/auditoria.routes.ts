import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Auditoría', descripcion: 'Registro de accesos y cambios.', fase: 1 },
  },
] satisfies Routes;
