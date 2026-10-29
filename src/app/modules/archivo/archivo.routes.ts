import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Archivo y Cierre', descripcion: 'Archivo del expediente al cierre del proceso.', fase: 5 },
  },
] satisfies Routes;
