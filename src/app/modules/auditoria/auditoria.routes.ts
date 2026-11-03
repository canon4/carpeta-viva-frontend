import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./auditoria').then((m) => m.Auditoria),
  },
] satisfies Routes;
