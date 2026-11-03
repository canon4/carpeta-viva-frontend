import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./inventario').then((m) => m.Inventario),
  },
] satisfies Routes;
