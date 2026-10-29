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
});
