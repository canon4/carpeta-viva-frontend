import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./asignaciones').then((m) => m.Asignaciones),
  },
] satisfies Routes;
