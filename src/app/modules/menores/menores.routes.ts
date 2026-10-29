import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Menores y Expedientes', descripcion: 'Carpeta digital de cada menor.', fase: 2 },
  },
] satisfies Routes;
