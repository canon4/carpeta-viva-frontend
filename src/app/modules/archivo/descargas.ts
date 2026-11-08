import type { HttpResponse } from '@angular/common/http';

/**
 * El backend descifra el paquete al vuelo y lo devuelve con `Content-Disposition: attachment`.
 * Copia local del mismo helper de `modules/documentos/descargas.ts` (cada módulo con carga
 * diferida es independiente).
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
