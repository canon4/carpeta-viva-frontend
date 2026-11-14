import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../config/app-config';
import type { components } from '../api/schema';

export type CatalogoOpcion = components['schemas']['CatalogoOpcionOut'];

/**
 * Lee catálogos administrables por `admin` (ADR-0013: `GET /configuracion/catalogos/{grupo}`,
 * abierto a cualquier autenticado). Cachea por grupo en memoria para no repetir la llamada en
 * cada formulario que la use dentro de la misma sesión. Quien lo use debe mantener un arreglo
 * de respaldo embebido por si la llamada falla (mismo criterio ya usado en el resto del sistema).
 */
@Injectable({ providedIn: 'root' })
export class CatalogosService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly cache = new Map<string, Promise<CatalogoOpcion[]>>();

  obtener(grupo: string): Promise<CatalogoOpcion[]> {
    let promesa = this.cache.get(grupo);
    if (!promesa) {
      promesa = firstValueFrom(
        this.http.get<CatalogoOpcion[]>(`${this.config.apiUrl}/configuracion/catalogos/${grupo}`),
      ).catch((error) => {
        this.cache.delete(grupo);
        throw error;
      });
      this.cache.set(grupo, promesa);
    }
    return promesa;
  }
}
