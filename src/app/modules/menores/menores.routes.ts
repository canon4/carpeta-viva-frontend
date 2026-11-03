import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./menores-lista').then((m) => m.MenoresLista),
  },
  {
    path: 'panel',
    loadComponent: () => import('./menores-panel').then((m) => m.MenoresPanel),
  },
  {
    path: ':id',
    loadComponent: () => import('./menor-detalle').then((m) => m.MenorDetalle),
  },
] satisfies Routes;
