import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./alimentos').then((m) => m.Alimentos),
  },
] satisfies Routes;
