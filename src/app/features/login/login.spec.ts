import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AppConfigService } from '../../core/config/app-config';
import { Login } from './login';

describe('Login', () => {
  async function crear(accesosRapidosDesarrollo: boolean): Promise<ComponentFixture<Login>> {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [
        provideRouter([{ path: 'panel', children: [] }]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AppConfigService,
          useValue: { apiUrl: '/api/v1', accesosRapidosDesarrollo },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Login);
    fixture.detectChanges();
    return fixture;
  }

  it('no muestra accesos rápidos si el flag está ausente o en falso', async () => {
    const fixture = await crear(false);
    const botones = fixture.nativeElement.querySelectorAll('.accesos-rapidos');
    expect(botones.length).toBe(0);
  });

  it('muestra accesos rápidos y dispara el login real si el flag es true', async () => {
    const fixture = await crear(true);
    const http = TestBed.inject(HttpTestingController);
    const boton: HTMLButtonElement = fixture.nativeElement.querySelector('.fila-botones button');
    expect(boton).toBeTruthy();

    boton.click();

    const peticion = http.expectOne('/api/v1/auth/login');
    expect(peticion.request.body).toEqual({ email: 'admin@demo.local', password: 'demo12345' });
    peticion.flush({ access_token: 'abc', token_type: 'bearer' });

    http.expectOne('/api/v1/auth/me').flush({ id: '1', email: 'admin@demo.local', rol: 'admin', zona_id: null });
  });
});
