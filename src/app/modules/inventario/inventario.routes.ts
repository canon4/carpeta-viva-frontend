import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Inventario del Hogar', descripcion: 'Camas, muebles, personas que viven y red de apoyo.', fase: 4 },
  },
] satisfies Routes;
