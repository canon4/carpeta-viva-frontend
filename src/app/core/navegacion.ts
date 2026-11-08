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
];
