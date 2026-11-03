import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./citas-lista').then((m) => m.CitasLista),
  },
] satisfies Routes;
