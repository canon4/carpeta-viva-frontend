import { TextoIaPipe } from './texto-ia.pipe';

describe('TextoIaPipe', () => {
  const pipe = new TextoIaPipe();

  it('convierte **negrita** en <strong>', () => {
    expect(pipe.transform('Ver **Informe de salud** ahora')).toBe('Ver <strong>Informe de salud</strong> ahora');
  });

  it('escapa el HTML que venga del modelo', () => {
    expect(pipe.transform('<img src=x onerror=alert(1)> **ok**')).toBe('&lt;img src=x onerror=alert(1)&gt; <strong>ok</strong>');
  });

  it('devuelve vacío sin texto', () => {
    expect(pipe.transform(null)).toBe('');
  });
});

describe('TextoIaPipe con tablas y títulos', () => {
  const pipe = new TextoIaPipe();

  it('convierte una tabla Markdown en tabla HTML y los títulos en negrita', () => {
    const html = pipe.transform('## Hallazgos\n| Área | Dato |\n|---|---|\n| Peso | normal |');
    expect(html).toBe(
      '<strong>Hallazgos</strong>\n<table class="tabla-ia"><thead><tr><th>Área</th><th>Dato</th></tr></thead><tbody><tr><td>Peso</td><td>normal</td></tr></tbody></table>',
    );
  });

  it('convierte *cursiva* sin tocar viñetas ni multiplicaciones', () => {
    expect(pipe.transform('*Nota:* borrador')).toBe('<em>Nota:</em> borrador');
    expect(pipe.transform('* punto\n2*3')).toBe('* punto\n2*3');
  });

  it('no deja pasar HTML dentro de una celda', () => {
    expect(pipe.transform('| <b>x</b> |')).toContain('&lt;b&gt;x&lt;/b&gt;');
  });
});
