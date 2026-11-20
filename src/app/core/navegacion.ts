export type Rol = 'madre' | 'profesional' | 'defensor' | 'coordinador' | 'auditor' | 'admin';

export interface ModuloNav {
  ruta: string;
  titulo: string;
  descripcion: string;
  fase: number;
  roles: Rol[];
}

// Visibilidad provisional por rol: se confirma con los profesionales y el agente de seguridad.
export const MODULOS: ModuloNav[] = [
  { ruta: 'zonas-hogares', titulo: 'Zonas y Hogares', descripcion: 'Zonas y hogares sustitutos con los datos de cada hogar.', fase: 1, roles: ['coordinador', 'admin'] },
  { ruta: 'madres', titulo: 'Madres Sustitutas', descripcion: 'Perfil, habilitación, capacitaciones y firma única.', fase: 1, roles: ['madre', 'coordinador', 'admin'] },
  { ruta: 'profesionales', titulo: 'Profesionales', descripcion: 'Defensor, psicosocial y nutricionista de cada menor.', fase: 1, roles: ['coordinador', 'admin'] },
  { ruta: 'menores', titulo: 'Menores y Expedientes', descripcion: 'Carpeta digital de cada menor.', fase: 2, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin'] },
  { ruta: 'asignaciones', titulo: 'Asignaciones y Traslados', descripcion: 'Vinculación del menor con el hogar y actas de traslado.', fase: 2, roles: ['profesional', 'defensor', 'coordinador', 'admin'] },
  { ruta: 'documentos', titulo: 'Gestión Documental', descripcion: 'Carga, clasificación, versionado y revisión de documentos.', fase: 3, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin', 'auditor'] },
  { ruta: 'inventario', titulo: 'Inventario del Hogar', descripcion: 'Camas, muebles, personas que viven y red de apoyo.', fase: 4, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin', 'auditor'] },
  { ruta: 'alimentos', titulo: 'Control de Alimentos', descripcion: 'Ingreso de mercado, perecederos y vencimientos.', fase: 4, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin', 'auditor'] },
  { ruta: 'citas', titulo: 'Citas y Recordatorios', descripcion: 'Recordatorio de citas médicas, psicosociales y reuniones con familia biológica.', fase: 4, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin', 'auditor'] },
  { ruta: 'alertas', titulo: 'Alertas y Evasiones', descripcion: 'Reporte de evasión, notificación y números de emergencia.', fase: 4, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin', 'auditor'] },
  // Reportes incluye a la madre: ADR-0010 sección 2 da acceso explícito a "madre/{madre_id}: la propia madre".
  { ruta: 'reportes', titulo: 'Reportes', descripcion: 'Reportes generales, por zona, por menor y por madre.', fase: 5, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'auditor', 'admin'] },
  // Se agrega admin: ADR-0010 sección 1.9 reserva GET /ia/estado (configuración del proveedor) para admin.
  { ruta: 'ia', titulo: 'Asistente de IA', descripcion: 'Búsqueda y resumen con citas a la fuente.', fase: 5, roles: ['madre', 'profesional', 'defensor', 'coordinador', 'admin'] },
  // Archivo y Cierre no menciona a "profesional" en ningún endpoint del ADR-0010 sección 3; se
  // agrega auditor (listado de expedientes archivados sin contenido, ADR-0010 "Consecuencias").
  { ruta: 'archivo', titulo: 'Archivo y Cierre', descripcion: 'Archivo del expediente al cierre del proceso.', fase: 5, roles: ['coordinador', 'admin', 'auditor'] },
  { ruta: 'auditoria', titulo: 'Auditoría', descripcion: 'Registro de accesos y cambios.', fase: 1, roles: ['auditor', 'admin'] },
  // Transversal T4 (ADR-0013): catálogos y parámetros editables sin redesplegar. Solo admin.
  { ruta: 'configuracion', titulo: 'Configuración', descripcion: 'Catálogos de opciones y parámetros de negocio administrables.', fase: 3, roles: ['admin'] },
];

export interface GrupoNav {
  id: string;
  titulo: string;
  rutas: string[];
}

// Categorías del menú lateral: agrupan los módulos por tarea para reducir el ruido visual.
export const GRUPOS: GrupoNav[] = [
  { id: 'expedientes', titulo: 'Expedientes', rutas: ['menores', 'asignaciones', 'documentos', 'archivo'] },
  { id: 'hogar', titulo: 'Vida del hogar', rutas: ['inventario', 'alimentos', 'citas'] },
  { id: 'seguimiento', titulo: 'Seguimiento', rutas: ['alertas', 'reportes', 'ia'] },
  { id: 'administracion', titulo: 'Administración', rutas: ['zonas-hogares', 'madres', 'profesionales', 'auditoria', 'configuracion'] },
];

// Trazos SVG (viewBox 24x24, estilo de línea) de cada módulo.
export const ICONOS: Record<string, string> = {
  panel: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  menores: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  asignaciones: 'M17 1l4 4-4 4M3 11V9a4 4 0 0 1 4-4h14M7 23l-4-4 4-4M21 13v2a4 4 0 0 1-4 4H3',
  documentos: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8',
  archivo: 'M21 8v13H3V8M1 3h22v5H1zM10 12h4',
  inventario: 'M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9',
  alimentos: 'M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18M16 10a4 4 0 0 1-8 0',
  citas: 'M3 4h18v18H3zM16 2v4M8 2v4M3 10h18',
  alertas: 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01',
  reportes: 'M18 20V10M12 20V4M6 20v-6',
  ia: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'zonas-hogares': 'M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM9 22V12h6v10',
  madres: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  profesionales: 'M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2zM16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16',
  auditoria: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z',
  configuracion: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
};
