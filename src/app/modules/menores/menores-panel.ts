import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type ZonaPanelGroup = components['schemas']['ZonaPanelGroup'];
type HogarPanelGroup = components['schemas']['HogarPanelGroup'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Panel agrupado por hogar y zona. El profesional/defensor ve solo sus menores a cargo
 * (`/menores/panel/profesional`); el coordinador ve los de su zona (`/menores/panel/zona`).
 */
@Component({
  selector: 'app-menores-panel',
  imports: [RouterLink],
  template: `
    <h1>Panel de menores a cargo</h1>
    <p><a routerLink="/menores">Ver lista completa</a></p>

    @if (cargando()) {
      <p class="nota">Cargando panel...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (esCoordinador()) {
      @for (hg of hogares(); track hg.hogar_id) {
        <section class="tarjeta">
          <h2>Hogar {{ hg.hogar_id }}</h2>
          <ul class="lista-simple">
            @for (m of hg.menores; track m.id) {
              <li>
                <a class="tarjeta" [routerLink]="['/menores', m.id]">
                  {{ m.nombres }} {{ m.apellidos }} — {{ m.estado_actual }}
                </a>
              </li>
            }
          </ul>
        </section>
      }
      @if (!cargando() && hogares().length === 0) {
        <p class="nota">No hay menores en los hogares de su zona.</p>
      }
    } @else {
      @for (zg of zonas(); track zg.zona_id) {
        <section class="tarjeta">
          <h2>Zona {{ zg.zona_id }}</h2>
          @for (hg of zg.hogares; track hg.hogar_id) {
            <h3>Hogar {{ hg.hogar_id }}</h3>
            <ul class="lista-simple">
              @for (m of hg.menores; track m.id) {
                <li>
                  <a class="tarjeta" [routerLink]="['/menores', m.id]">
                    {{ m.nombres }} {{ m.apellidos }} — {{ m.estado_actual }}
                  </a>
                </li>
              }
            </ul>
          }
        </section>
      }
      @if (!cargando() && zonas().length === 0) {
        <p class="nota">No tiene menores a cargo por ahora.</p>
      }
    }
  `,
})
export class MenoresPanel {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly zonas = signal<ZonaPanelGroup[]>([]);
  protected readonly hogares = signal<HogarPanelGroup[]>([]);

  protected readonly esCoordinador = () => this.auth.rol() === 'coordinador';

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      if (this.esCoordinador()) {
        this.hogares.set(
          await firstValueFrom(
            this.http.get<HogarPanelGroup[]>(`${this.config.apiUrl}/menores/panel/zona`),
          ),
        );
      } else {
        this.zonas.set(
          await firstValueFrom(
            this.http.get<ZonaPanelGroup[]>(`${this.config.apiUrl}/menores/panel/profesional`),
          ),
        );
      }
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }
}
