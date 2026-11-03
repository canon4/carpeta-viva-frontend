import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./zonas-hogares').then((m) => m.ZonasHogares),
  },
] satisfies Routes;
