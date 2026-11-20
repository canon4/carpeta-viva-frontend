import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { IaConsulta } from './ia-consulta';

const RESPUESTA = {
  id: '1',
  usuario_id: 'u1',
  pregunta: '¿Cuándo fue la última visita médica?',
  respuesta: 'La última visita fue el 2 de octubre.',
  menor_id: 'menor-1',
  hogar_id: null,
  fragmentos_usados: [{ categoria: 'salud', fecha: '2026-10-02', texto: 'salud — 2026-10-02' }],
  modelo: 'modelo-sintetico',
  proveedor: 'anthropic',
  anonimizado: true,
  sin_resultado: false,
  duracion_ms: 120,
  creado_en: '2026-11-01T00:00:00Z',
};

describe('IaConsulta', () => {
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
  });

  it('envía la pregunta con el contexto y agrega la respuesta con sus citas al hilo', async () => {
    const componente = TestBed.createComponent(IaConsulta).componentInstance;
    componente['menorId'] = 'menor-1';

    const promesa = componente['enviar']('¿Cuándo fue la última visita médica?');
    expect(componente['mensajes']().at(-1)?.estado).toBe('cargando');
    const peticion = http.expectOne({ method: 'POST', url: '/api/v1/ia/consultas' });
    expect(peticion.request.body).toEqual({
      pregunta: '¿Cuándo fue la última visita médica?',
      menor_id: 'menor-1',
      hogar_id: null,
    });
    peticion.flush(RESPUESTA);
    await promesa;

    const ultimo = componente['mensajes']().at(-1)!;
    expect(ultimo.estado).toBe('listo');
    expect(ultimo.respuesta?.respuesta).toContain('última visita');
    expect(componente['fragmentosDe'](ultimo.respuesta).length).toBe(1);
  });

  it('carga el historial como mensajes previos, del más antiguo al más reciente, y respeta solo metadatos', async () => {
    const componente = TestBed.createComponent(IaConsulta).componentInstance;
    http.expectOne({ method: 'GET', url: '/api/v1/ia/consultas' }).flush([
      { ...RESPUESTA, id: '2', pregunta: 'segunda', creado_en: '2026-11-02T00:00:00Z' },
      { ...RESPUESTA, id: '1', pregunta: 'primera' },
      { id: '3', usuario_id: 'u1', modelo: 'm', proveedor: 'p', anonimizado: true, sin_resultado: false, duracion_ms: 1, creado_en: '2026-11-03T00:00:00Z' },
    ]);
    await Promise.resolve();
    await Promise.resolve();

    const mensajes = componente['mensajes']();
    expect(mensajes.map((m) => m.pregunta)).toEqual(['primera', 'segunda', '']);
    expect(mensajes[2].metadatos).toEqual({ proveedor: 'p', modelo: 'm' });
  });

  it('solo admin ve el enlace a la configuración del asistente', () => {
    const fixture = TestBed.createComponent(IaConsulta);
    const auth = TestBed.inject(AuthService);
    auth.usuario.set({ id: 'u1', email: 'a@a.com', rol: 'madre', zona_id: null });
    expect(fixture.componentInstance['esAdmin']()).toBe(false);

    auth.usuario.set({ id: 'u2', email: 'b@b.com', rol: 'admin', zona_id: null });
    expect(fixture.componentInstance['esAdmin']()).toBe(true);
  });
});
