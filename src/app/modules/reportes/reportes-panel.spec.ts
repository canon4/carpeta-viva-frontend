import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { ReportesPanel } from './reportes-panel';

describe('ReportesPanel', () => {
  let http: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  it('coordinador puede ver el reporte general (el backend lo acota a su zona automáticamente)', async () => {
    auth.usuario.set({ id: 'u1', email: 'c@c.com', rol: 'coordinador', zona_id: 'zona-1' });
    const fixture = TestBed.createComponent(ReportesPanel);
    fixture.detectChanges();
    expect(fixture.componentInstance['puedeGeneral']()).toBe(true);

    const promesa = fixture.componentInstance['cargarGeneral']();
    const peticion = http.expectOne('/api/v1/reportes/general');
    peticion.flush({
      zona_id: 'zona-1',
      menores_por_estado: { activo: 3 },
      hogares_total: 2,
      hogares_capacidad_total: 12,
      hogares_con_ocupacion_vigente: 2,
      documentos_pendientes_revision: 1,
      alertas_activas_por_tipo: {},
      citas_vencidas: 0,
      alimentos_vencidos: 0,
    });
    await promesa;

    expect(fixture.componentInstance['general']()?.zona_id).toBe('zona-1');
  });

  it('profesional no ve el reporte general ni el de madre: solo llega por el expediente de un menor', () => {
    auth.usuario.set({ id: 'u2', email: 'p@p.com', rol: 'profesional', zona_id: null });
    const fixture = TestBed.createComponent(ReportesPanel);
    fixture.detectChanges();
    expect(fixture.componentInstance['puedeGeneral']()).toBe(false);
    expect(fixture.componentInstance['esMadre']()).toBe(false);
  });

  it('auditor no ve el botón de exportar', () => {
    auth.usuario.set({ id: 'u3', email: 'a@a.com', rol: 'auditor', zona_id: null });
    const fixture = TestBed.createComponent(ReportesPanel);
    fixture.detectChanges();
    expect(fixture.componentInstance['puedeExportar']()).toBe(false);
    expect(fixture.componentInstance['puedeGeneral']()).toBe(true);
  });
});
