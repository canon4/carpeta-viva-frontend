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
 * El token vive solo en memoria (no en localStorage). Al recargar la página hay que iniciar sesión de nuevo.
 * El agente de seguridad define el esquema definitivo (cookie httpOnly o renovación de token).
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
      this.http.post<Token>(`${this.config.apiUrl}/auth/login`, { email, password }),
    );
    this.tokenActual.set(t.access_token);
    this.usuario.set(await firstValueFrom(this.http.get<Usuario>(`${this.config.apiUrl}/auth/me`)));
  }

  logout(): void {
    this.tokenActual.set(null);
    this.usuario.set(null);
    void this.router.navigate(['/login']);
  }
}
