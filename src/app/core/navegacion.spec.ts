import { MODULOS } from './navegacion';

describe('navegación por rol', () => {
  const ve = (rol: Parameters<(typeof MODULOS)[number]['roles']['includes']>[0], ruta: string) =>
    MODULOS.find((m) => m.ruta === ruta)?.roles.includes(rol) ?? false;

  it('la madre no ve Auditoría ni Zonas', () => {
    expect(ve('madre', 'auditoria')).toBe(false);
    expect(ve('madre', 'zonas-hogares')).toBe(false);
  });

  it('el coordinador ve Zonas y el auditor ve Auditoría', () => {
    expect(ve('coordinador', 'zonas-hogares')).toBe(true);
    expect(ve('auditor', 'auditoria')).toBe(true);
  });

  it('cada módulo tiene al menos un rol y una fase del 1 al 5', () => {
    for (const m of MODULOS) {
      expect(m.roles.length).toBeGreaterThan(0);
      expect(m.fase).toBeGreaterThanOrEqual(1);
      expect(m.fase).toBeLessThanOrEqual(5);
    }
  });

  it('Reportes incluye a la madre (ADR-0010 sección 2: "madre/{madre_id}: la propia madre")', () => {
    expect(ve('madre', 'reportes')).toBe(true);
  });

  it('el asistente de IA incluye a admin (ADR-0010 sección 1.9: GET /ia/estado es solo admin)', () => {
    expect(ve('admin', 'ia')).toBe(true);
  });

  it(
    'Archivo y Cierre no incluye a profesional (sin mención en ningún endpoint de ADR-0010 ' +
      'sección 3) pero sí a auditor (listado de expedientes archivados sin contenido)',
    () => {
      expect(ve('profesional', 'archivo')).toBe(false);
      expect(ve('auditor', 'archivo')).toBe(true);
    },
  );
});
