import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Asignaciones y Traslados', descripcion: 'Vinculación del menor con el hogar y actas de traslado.', fase: 2 },
  },
] satisfies Routes;
