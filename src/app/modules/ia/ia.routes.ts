import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./ia-consulta').then((m) => m.IaConsulta),
  },
  {
    path: 'redaccion',
    loadComponent: () => import('./apoyo-redaccion').then((m) => m.ApoyoRedaccion),
  },
  {
    path: 'estado',
    loadComponent: () => import('./estado-ia').then((m) => m.EstadoIa),
  },
  {
    path: 'menores/:menorId/resumen',
    loadComponent: () => import('./resumen-menor').then((m) => m.ResumenMenor),
  },
] satisfies Routes;
