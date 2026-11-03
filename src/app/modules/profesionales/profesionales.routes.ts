import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./profesionales').then((m) => m.Profesionales),
  },
] satisfies Routes;
