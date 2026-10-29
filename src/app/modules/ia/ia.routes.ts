import { Routes } from '@angular/router';

export default [
  {
    path: '',
    loadComponent: () =>
      import('../../shared/modulo-pendiente/modulo-pendiente').then((m) => m.ModuloPendiente),
    data: { titulo: 'Asistente de IA', descripcion: 'Búsqueda y resumen con citas a la fuente.', fase: 5 },
  },
] satisfies Routes;
