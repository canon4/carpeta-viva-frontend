import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from './auth';

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: 'login', children: [] }]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('guarda el token y el usuario tras iniciar sesión', async () => {
    const promesa = auth.login('defensor@prueba.local', 'clave');
    http.expectOne('/api/v1/auth/login').flush({ access_token: 'abc', token_type: 'bearer' });
    await Promise.resolve();
    http.expectOne('/api/v1/auth/me').flush({ id: '1', email: 'defensor@prueba.local', rol: 'defensor', zona_id: null });
    await promesa;
    expect(auth.autenticado()).toBe(true);
    expect(auth.rol()).toBe('defensor');
  });

  it('cierra la sesión', () => {
    auth.logout();
    expect(auth.autenticado()).toBe(false);
    expect(auth.usuario()).toBeNull();
  });
});
