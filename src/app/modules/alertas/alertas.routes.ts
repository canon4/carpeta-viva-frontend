import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./alertas-lista').then((m) => m.AlertasLista),
  },
  {
    path: 'reportar-evasion',
    loadComponent: () => import('./reportar-evasion').then((m) => m.ReportarEvasion),
  },
] satisfies Routes;
