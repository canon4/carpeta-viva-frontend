/** Opciones de formato de exportación (ADR-0010 sección 2) y etiquetas de los cuatro niveles. */
export interface FormatoOpcion {
  valor: string;
  etiqueta: string;
}

export const FORMATOS: FormatoOpcion[] = [
  { valor: 'json', etiqueta: 'Pantalla (JSON)' },
  { valor: 'pdf', etiqueta: 'PDF' },
  { valor: 'csv', etiqueta: 'CSV' },
];

const ETIQUETAS_NIVEL: Record<string, string> = {
  general: 'General',
  zona: 'Por zona',
  menor: 'Por menor',
  madre: 'Por madre',
};

export function etiquetaNivel(nivel: string): string {
  return ETIQUETAS_NIVEL[nivel] ?? nivel;
}

/** Convierte un diccionario `{clave: numero}` (ej. menores_por_estado) en pares para mostrar en lista. */
export function pares(dic: Record<string, number> | undefined | null): [string, number][] {
  return Object.entries(dic ?? {});
}
