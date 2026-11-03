import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./madres').then((m) => m.Madres),
  },
] satisfies Routes;
