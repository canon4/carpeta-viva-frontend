import type { HttpResponse } from '@angular/common/http';

/**
 * El backend devuelve el archivo exportado con `Content-Disposition: attachment`. Aquí solo se
 * crea un enlace temporal para que el navegador lo guarde con su nombre original. Copia local del
 * mismo helper de `modules/documentos/descargas.ts`: cada módulo con carga diferida es
 * independiente (no se importa entre módulos para no romper el troceo por módulo).
 */
export function descargarBlob(respuesta: HttpResponse<Blob>, nombrePorDefecto: string): void {
  const cuerpo = respuesta.body;
  if (!cuerpo) return;
  const disposicion = respuesta.headers.get('Content-Disposition') ?? '';
  const coincidencia = /filename="?([^";]+)"?/i.exec(disposicion);
  const nombre = coincidencia?.[1] ?? nombrePorDefecto;
  const url = URL.createObjectURL(cuerpo);
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.download = nombre;
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
  URL.revokeObjectURL(url);
}
