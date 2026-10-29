import { Routes } from '@angular/router';

import { authGuard } from './core/auth/guards';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/login/login').then((m) => m.Login) },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'panel' },
      { path: 'panel', loadComponent: () => import('./features/panel/panel').then((m) => m.Panel) },
      { path: 'zonas-hogares', loadChildren: () => import('./modules/zonas-hogares/zonas-hogares.routes') },
      { path: 'madres', loadChildren: () => import('./modules/madres/madres.routes') },
      { path: 'profesionales', loadChildren: () => import('./modules/profesionales/profesionales.routes') },
      { path: 'menores', loadChildren: () => import('./modules/menores/menores.routes') },
      { path: 'asignaciones', loadChildren: () => import('./modules/asignaciones/asignaciones.routes') },
      { path: 'documentos', loadChildren: () => import('./modules/documentos/documentos.routes') },
      { path: 'inventario', loadChildren: () => import('./modules/inventario/inventario.routes') },
      { path: 'alimentos', loadChildren: () => import('./modules/alimentos/alimentos.routes') },
      { path: 'citas', loadChildren: () => import('./modules/citas/citas.routes') },
      { path: 'alertas', loadChildren: () => import('./modules/alertas/alertas.routes') },
      { path: 'reportes', loadChildren: () => import('./modules/reportes/reportes.routes') },
      { path: 'ia', loadChildren: () => import('./modules/ia/ia.routes') },
      { path: 'archivo', loadChildren: () => import('./modules/archivo/archivo.routes') },
      { path: 'auditoria', loadChildren: () => import('./modules/auditoria/auditoria.routes') },
    ],
  },
  { path: '**', redirectTo: '' },
];
