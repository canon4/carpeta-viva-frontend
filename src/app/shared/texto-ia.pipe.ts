import { Pipe, PipeTransform } from '@angular/core';

/**
 * Formato mínimo para el texto que devuelve el modelo. Primero escapa todo el HTML (la respuesta es
 * contenido no confiable) y después reconoce solo un subconjunto de Markdown: **negrita**, títulos
 * con # y tablas con |. No interpreta enlaces, imágenes ni HTML. Se usa con [innerHTML], que además
 * pasa por el sanitizador de Angular.
 */
@Pipe({ name: 'textoIa' })
export class TextoIaPipe implements PipeTransform {
  transform(texto: string | null | undefined): string {
    if (!texto) return '';
    const lineas = escapar(texto).split('\n');
    const salida: string[] = [];
    for (let i = 0; i < lineas.length; i++) {
      if (esFilaTabla(lineas[i])) {
        const bloque: string[] = [];
        while (i < lineas.length && esFilaTabla(lineas[i])) bloque.push(lineas[i++]);
        i--;
        salida.push(tabla(bloque));
        continue;
      }
      const titulo = /^#{1,6}\s+(.*)$/.exec(lineas[i]);
      salida.push(titulo ? `<strong>${titulo[1]}</strong>` : lineas[i]);
    }
    return negritas(salida.join('\n'));
  }
}

function escapar(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function negritas(t: string): string {
  return t
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])\*([^*\n]+?)\*(?=[\s.,;:)<]|$)/gm, '$1<em>$2</em>');
}

function esFilaTabla(linea: string): boolean {
  const l = linea.trim();
  return l.startsWith('|') && l.endsWith('|') && l.length > 1;
}

function celdas(linea: string): string[] {
  return linea.trim().slice(1, -1).split('|').map((c) => c.trim());
}

/** La tabla va sin saltos de línea internos porque el contenedor usa white-space: pre-wrap. */
function tabla(filas: string[]): string {
  const separador = (l: string) => celdas(l).every((c) => /^:?-{2,}:?$/.test(c));
  const utiles = filas.filter((l) => !separador(l));
  if (utiles.length === 0) return '';
  const tieneEncabezado = filas.length > 1 && separador(filas[1]);
  const [primera, ...resto] = utiles;
  const cabeza = tieneEncabezado ? `<thead><tr>${celdas(primera).map((c) => `<th>${c}</th>`).join('')}</tr></thead>` : '';
  const cuerpo = (tieneEncabezado ? resto : utiles).map((l) => `<tr>${celdas(l).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('');
  return `<table class="tabla-ia">${cabeza}<tbody>${cuerpo}</tbody></table>`;
}
