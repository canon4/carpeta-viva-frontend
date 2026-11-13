/**
 * Categorías documentales (provisionales, ADR-0008 sección 2). Si el operador define una tabla
 * de retención oficial, esta lista y el `CheckConstraint` del backend se actualizan juntos.
 */
export interface CategoriaOpcion {
  valor: string;
  etiqueta: string;
}

export const CATEGORIAS_MENOR: CategoriaOpcion[] = [
  { valor: 'identidad', etiqueta: 'Identidad' },
  { valor: 'salud', etiqueta: 'Salud' },
  { valor: 'psicosocial', etiqueta: 'Psicosocial' },
  { valor: 'educacion', etiqueta: 'Educación' },
  { valor: 'familia_red_apoyo', etiqueta: 'Familia y red de apoyo' },
  { valor: 'actas_traslados', etiqueta: 'Actas de traslado' },
  { valor: 'otros', etiqueta: 'Otros' },
];

export const CATEGORIAS_HOGAR: CategoriaOpcion[] = [
  { valor: 'madre_habilitacion', etiqueta: 'Habilitación de la madre' },
  { valor: 'otros', etiqueta: 'Otros' },
];

export const ESTADOS_FLUJO: CategoriaOpcion[] = [
  { valor: 'borrador', etiqueta: 'Borrador' },
  { valor: 'en_revision', etiqueta: 'En revisión' },
  { valor: 'aprobado', etiqueta: 'Aprobado' },
  { valor: 'devuelto', etiqueta: 'Devuelto' },
];

export function etiquetaCategoria(valor: string): string {
  return (
    CATEGORIAS_MENOR.find((c) => c.valor === valor)?.etiqueta ??
    CATEGORIAS_HOGAR.find((c) => c.valor === valor)?.etiqueta ??
    valor
  );
}

export function etiquetaEstadoFlujo(valor: string): string {
  return ESTADOS_FLUJO.find((e) => e.valor === valor)?.etiqueta ?? valor;
}

/** Tipos que el visor puede mostrar en pantalla (ADR-0011); debe coincidir con `MIME_VISUALIZABLES`
 * de `app/modules/documentos/domain.py` en el backend. Otros formatos (Word/Excel, etc.) solo se
 * descargan, como antes. */
const MIME_VISUALIZABLES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp']);

export function esVisualizable(mimeType: string): boolean {
  return MIME_VISUALIZABLES.has(mimeType);
}

export function formatoTamanio(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
