import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { ArchivoMenor } from './archivo-menor';

const RUTA_FALSA = {
  snapshot: { paramMap: { get: () => 'menor-1' } },
} as unknown as ActivatedRoute;

describe('ArchivoMenor', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: RUTA_FALSA },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  function crear() {
    const fixture = TestBed.createComponent(ArchivoMenor);
    http.expectOne('/api/v1/archivo/menores/menor-1').flush({
      id: null,
      menor_id: 'menor-1',
      estado: 'activo',
      archivado_en: null,
      archivado_por: null,
      motivo: null,
      zona_id: 'zona-1',
      paquete_hash: null,
      destino: 'almacenamiento local cifrado — destino externo pendiente de definir con el operador',
      enviado_en: null,
    });
    return fixture;
  }

  it('no archiva sin pasar por la confirmación explícita con motivo', () => {
    auth.usuario.set({ id: 'u1', email: 'coord@a.com', rol: 'coordinador', zona_id: 'zona-1' });
    const fixture = crear();
    const c = fixture.componentInstance;

    expect(c['puedeArchivar']()).toBe(true);
    expect(c['mostrarConfirmacion']()).toBe(false);

    c['mostrarConfirmacion'].set(true);
    expect(c['mostrarConfirmacion']()).toBe(true);

    c['motivo'] = 'Egreso del menor, proceso de restitución cerrado';
    const promesa = c['confirmarArchivo']();
    const peticion = http.expectOne('/api/v1/archivo/menores/menor-1/cerrar');
    expect(peticion.request.body).toEqual({ motivo: 'Egreso del menor, proceso de restitución cerrado' });
    peticion.flush({
      id: '1',
      menor_id: 'menor-1',
      estado: 'archivado',
      archivado_en: '2026-11-04T00:00:00Z',
      archivado_por: 'u1',
      motivo: 'Egreso del menor, proceso de restitución cerrado',
      zona_id: 'zona-1',
      paquete_hash: 'abc123',
      destino: 'almacenamiento local cifrado — destino externo pendiente de definir con el operador',
      enviado_en: null,
    });
    return promesa.then(() => {
      expect(c['estado']()?.estado).toBe('archivado');
      expect(c['mostrarConfirmacion']()).toBe(false);
    });
  });

  it('auditor ve el estado pero nunca el botón de descargar el paquete', () => {
    auth.usuario.set({ id: 'u2', email: 'aud@a.com', rol: 'auditor', zona_id: null });
    const fixture = crear();
    expect(fixture.componentInstance['puedeDescargarPaquete']()).toBe(false);
    expect(fixture.componentInstance['puedeArchivar']()).toBe(false);
  });
});
