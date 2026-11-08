import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { IaConsulta } from './ia-consulta';

describe('IaConsulta', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('envía la pregunta con el contexto y muestra la respuesta y sus citas', async () => {
    const fixture = TestBed.createComponent(IaConsulta);
    const componente = fixture.componentInstance;
    componente['pregunta'] = '¿Cuándo fue la última visita médica?';
    componente['menorId'] = 'menor-1';

    const promesa = componente['preguntar']();
    const peticion = http.expectOne('/api/v1/ia/consultas');
    expect(peticion.request.body).toEqual({
      pregunta: '¿Cuándo fue la última visita médica?',
      menor_id: 'menor-1',
      hogar_id: null,
    });
    peticion.flush({
      id: '1',
      usuario_id: 'u1',
      pregunta: '¿Cuándo fue la última visita médica?',
      respuesta: 'La última visita fue el 2 de octubre.',
      menor_id: 'menor-1',
      hogar_id: null,
      fragmentos_usados: [{ categoria: 'salud', fecha: '2026-10-02', texto: 'salud — 2026-10-02' }],
      modelo: 'claude',
      proveedor: 'anthropic',
      anonimizado: true,
      sin_resultado: false,
      duracion_ms: 120,
      creado_en: '2026-11-01T00:00:00Z',
    });
    await promesa;

    expect(componente['respuesta']()?.respuesta).toContain('última visita');
    expect(componente['fragmentosDe'](componente['respuesta']()!).length).toBe(1);
  });

  it('distingue filas de solo metadatos (auditor) de las filas completas en el historial', () => {
    const fixture = TestBed.createComponent(IaConsulta);
    const componente = fixture.componentInstance;
    const filaCompleta = { pregunta: 'x', respuesta: 'y' } as any;
    const filaMetadatos = { modelo: 'claude', proveedor: 'anthropic' } as any;
    expect(componente['esMetadatosSolo'](filaCompleta)).toBe(false);
    expect(componente['esMetadatosSolo'](filaMetadatos)).toBe(true);
    expect(componente['preguntaDe'](filaCompleta)).toBe('x');
    expect(componente['preguntaDe'](filaMetadatos)).toBe('');
  });

  it('solo admin ve el enlace a la configuración del asistente', () => {
    const fixture = TestBed.createComponent(IaConsulta);
    const auth = TestBed.inject(AuthService);
    auth.usuario.set({ id: 'u1', email: 'a@a.com', rol: 'madre', zona_id: null });
    fixture.detectChanges();
    expect(fixture.componentInstance['esAdmin']()).toBe(false);

    auth.usuario.set({ id: 'u2', email: 'b@b.com', rol: 'admin', zona_id: null });
    fixture.detectChanges();
    expect(fixture.componentInstance['esAdmin']()).toBe(true);
  });
});
