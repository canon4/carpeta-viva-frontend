import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./documentos-lista').then((m) => m.DocumentosLista),
  },
  {
    path: ':id',
    loadComponent: () => import('./documento-detalle').then((m) => m.DocumentoDetalle),
  },
] satisfies Routes;
