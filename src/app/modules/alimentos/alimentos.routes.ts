import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Control de Alimentos', descripcion: 'Ingreso de mercado, perecederos y vencimientos.', fase: 4 },
  },
] satisfies Routes;
