import { Injectable } from '@angular/core';

export interface AppConfig {
  apiUrl: string;
}

/** Lee public/config.json en tiempo de ejecución: la dirección de la API no se compila en la app. */
@Injectable({ providedIn: 'root' })
export class AppConfigService {
  private config: AppConfig = { apiUrl: '/api/v1' };

  get apiUrl(): string {
    return this.config.apiUrl;
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
