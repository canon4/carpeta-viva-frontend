/** Tipos de informe conocidos para el apoyo a la redacción (ADR-0010 sección 1.8, mismos valores que `Reporte.tipo_reporte`, ADR-0008). */
export interface TipoInformeOpcion {
  valor: string;
  etiqueta: string;
}

export const TIPOS_INFORME: TipoInformeOpcion[] = [
  { valor: 'informe_psicosocial', etiqueta: 'Informe psicosocial' },
  { valor: 'informe_medico', etiqueta: 'Informe médico' },
  { valor: 'informe_nutricion', etiqueta: 'Informe de nutrición' },
];
