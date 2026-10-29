import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Citas y Recordatorios', descripcion: 'Recordatorio de citas médicas, psicosociales y reuniones con familia biológica.', fase: 4 },
  },
] satisfies Routes;
