import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Gestión Documental', descripcion: 'Carga, clasificación, versionado y revisión de documentos.', fase: 3 },
  },
] satisfies Routes;
