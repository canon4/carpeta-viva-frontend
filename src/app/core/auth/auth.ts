import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import type { components } from '../api/schema';
import { AppConfigService } from '../config/app-config';
import type { Rol } from '../navegacion';

type Usuario = components['schemas']['UsuarioOut'];
type Token = components['schemas']['TokenOut'];

/**
 * El access token vive solo en memoria (nunca en localStorage/sessionStorage: no sobrevive a un
 * cierre de pestaña ni queda expuesto si hay XSS). Lo que sobrevive a recargar la página es la
 * cookie `refresh_token` que pone el backend (httpOnly, no la toca este código ni ningún otro
 * script): `intentarRestaurarSesion` la usa para pedir un access token nuevo al arrancar la app.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly router = inject(Router);

  private readonly tokenActual = signal<string | null>(null);
  readonly usuario = signal<Usuario | null>(null);
  readonly autenticado = computed(() => this.tokenActual() !== null);
  readonly rol = computed(() => (this.usuario()?.rol as Rol | undefined) ?? null);

  get token(): string | null {
    return this.tokenActual();
  }

  async login(email: string, password: string): Promise<void> {
    const t = await firstValueFrom(
      this.http.post<Token>(`${this.config.apiUrl}/auth/login`, { email, password }, { withCredentials: true }),
    );
    this.tokenActual.set(t.access_token);
    this.usuario.set(await firstValueFrom(this.http.get<Usuario>(`${this.config.apiUrl}/auth/me`)));
  }

  /** Se llama una sola vez al arrancar la app (`app.config.ts`). Si no hay cookie de sesión
   * válida, falla en silencio: el usuario simplemente ve el login, como hoy. */
  async intentarRestaurarSesion(): Promise<void> {
    try {
      const t = await firstValueFrom(
        this.http.post<Token>(`${this.config.apiUrl}/auth/refrescar`, null, { withCredentials: true }),
      );
      this.tokenActual.set(t.access_token);
      this.usuario.set(await firstValueFrom(this.http.get<Usuario>(`${this.config.apiUrl}/auth/me`)));
    } catch {
      this.tokenActual.set(null);
      this.usuario.set(null);
    }
  }

  logout(): void {
    this.tokenActual.set(null);
    this.usuario.set(null);
    void this.router.navigate(['/login']);
    // Sin esperar la respuesta: la sesión ya se cerró del lado del navegador; esto solo borra la
    // cookie de refresco en el servidor para que no quede viva sin uso.
    void firstValueFrom(this.http.post(`${this.config.apiUrl}/auth/logout`, null, { withCredentials: true })).catch(
      () => undefined,
    );
  }
}
