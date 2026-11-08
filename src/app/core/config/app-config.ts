import { Injectable } from '@angular/core';

export interface AppConfig {
  apiUrl: string;
  /**
   * Solo para desarrollo local: muestra en el login botones de acceso rápido con los
   * usuarios sintéticos de `backend/scripts/seed_sintetico.py`. Si `config.json` no trae
   * esta clave, el valor por defecto es `false` para que nunca aparezca en una URL pública.
   */
  accesosRapidosDesarrollo: boolean;
}

/** Lee public/config.json en tiempo de ejecución: la dirección de la API no se compila en la app. */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private config: AppConfig = { apiUrl: '/api/v1', accesosRapidosDesarrollo: false };

  get apiUrl(): string {
    return this.config.apiUrl;
  }

  get accesosRapidosDesarrollo(): boolean {
    return this.config.accesosRapidosDesarrollo;
  }

  async load(): Promise<void> {
    try {
      const respuesta = await fetch('config.json', { cache: 'no-store' });
      if (respuesta.ok) {
        this.config = { ...this.config, ...(await respuesta.json()) };
      }
    } catch {
      // Sin config.json se usa el valor por defecto.
    }
  }
}
