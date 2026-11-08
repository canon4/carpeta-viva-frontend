import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./archivo-lista').then((m) => m.ArchivoLista),
  },
  {
    path: 'menores/:menorId',
    loadComponent: () => import('./archivo-menor').then((m) => m.ArchivoMenor),
  },
] satisfies Routes;
