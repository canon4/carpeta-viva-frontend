import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./perfil').then((m) => m.Perfil),
  },
] satisfies Routes;
