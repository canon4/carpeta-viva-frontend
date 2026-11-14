/**
 * Categorías documentales: valor por defecto embebido (ADR-0013 sección 7, punto 1). La fuente
 * de verdad es ahora el catálogo administrable (`GET /configuracion/catalogos/categoria_documento_menor`
 * y `.../categoria_documento_hogar`, cualquier autenticado); estos arreglos quedan como respaldo
 * si la llamada a la API falla, no se borran.
 */
export interface CategoriaOpcion {
  valor: string;
  etiqueta: string;
}

/** Grupos de catálogo registrados en `configuracion.domain.GRUPOS_CATALOGO` (ADR-0013). */
export const GRUPO_CATEGORIA_MENOR = 'categoria_documento_menor';
export const GRUPO_CATEGORIA_HOGAR = 'categoria_documento_hogar';

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

/**
 * Resuelve la etiqueta de una categoría. Busca primero en el catálogo dinámico (si se pasa,
 * normalmente ya combina `categoria_documento_menor` + `categoria_documento_hogar` leídos de la
 * API), para poder mostrar categorías creadas por `admin` que ya no están en el arreglo fijo;
 * si no la encuentra ahí, cae al arreglo fijo (respaldo) y, en último caso, al valor crudo.
 */
export function etiquetaCategoria(valor: string, catalogoDinamico?: CategoriaOpcion[]): string {
  return (
    catalogoDinamico?.find((c) => c.valor === valor)?.etiqueta ??
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
