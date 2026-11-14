import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./configuracion').then((m) => m.Configuracion),
  },
] satisfies Routes;
