import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Alertas y Evasiones', descripcion: 'Reporte de evasión, notificación y números de emergencia.', fase: 4 },
  },
] satisfies Routes;
