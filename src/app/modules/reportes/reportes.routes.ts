import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () => import('./reportes-panel').then((m) => m.ReportesPanel),
  },
  {
    path: 'exportados',
    loadComponent: () => import('./reportes-exportados').then((m) => m.ReportesExportados),
  },
  {
    path: 'zona/:zonaId',
    loadComponent: () => import('./reporte-zona').then((m) => m.ReporteZona),
  },
  {
    path: 'menor/:menorId',
    loadComponent: () => import('./reporte-menor').then((m) => m.ReporteMenor),
  },
  {
    path: 'madre/:madreId',
    loadComponent: () => import('./reporte-madre').then((m) => m.ReporteMadre),
  },
] satisfies Routes;
