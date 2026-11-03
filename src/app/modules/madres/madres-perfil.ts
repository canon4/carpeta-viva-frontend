import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Madre = components['schemas']['MadreOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Perfil de la madre sustituta autenticada: sus datos y la carga de su firma única. */
@Component({
  selector: 'app-madres-perfil',
  imports: [FormsModule],
  template: `
    <h1>Mi perfil</h1>

    @if (cargando()) {
      <p class="nota">Cargando su información...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (madre()) {
      <section class="tarjeta">
        <h2>{{ madre()!.nombres }} {{ madre()!.apellidos }}</h2>
        <p>Número de identificación: {{ madre()!.numero_identificacion }}</p>
        <p>Teléfono: {{ madre()!.telefono || 'Sin registrar' }}</p>
        <p>Dirección: {{ madre()!.direccion || 'Sin registrar' }}</p>
        <p>Estado de certificación: {{ madre()!.estado_certificacion }}</p>
      </section>

      <section class="tarjeta">
        <h2>Mi firma</h2>
        <p class="nota">
          Esta es una demostración: aquí se guarda una referencia de texto a su firma, no una imagen real.
          Usted solo la carga una vez y responde por su validez.
        </p>
        <form class="formulario" (ngSubmit)="guardarFirma()" #f="ngForm">
          <label for="firma">Referencia de la firma</label>
          <textarea
            id="firma"
            name="firma"
            rows="3"
            required
            [(ngModel)]="firmaTexto"
            placeholder="Ejemplo: firma-escaneada-maria-perez.png"
          ></textarea>
          <button type="submit" [disabled]="f.invalid || guardandoFirma()">
            {{ guardandoFirma() ? 'Guardando...' : 'Guardar firma' }}
          </button>
        </form>
        @if (mensajeExito()) {
          <p class="exito" role="status">{{ mensajeExito() }}</p>
        }
      </section>
    }
  `,
})
export class MadresPerfil {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly madre = signal<Madre | null>(null);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardandoFirma = signal(false);
  protected readonly mensajeExito = signal('');
  protected firmaTexto = '';

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const madre = await firstValueFrom(this.http.get<Madre>(`${this.config.apiUrl}/madres/yo`));
      this.madre.set(madre);
      this.firmaTexto = madre.firma_ref ?? '';
    } catch {
      this.error.set('No se pudo cargar su información. Intente de nuevo más tarde.');
    } finally {
      this.cargando.set(false);
    }
  }

  protected async guardarFirma(): Promise<void> {
    this.guardandoFirma.set(true);
    this.error.set('');
    this.mensajeExito.set('');
    try {
      const actualizada = await firstValueFrom(
        this.http.put<Madre>(`${this.config.apiUrl}/madres/yo/firma`, { firma_ref: this.firmaTexto }),
      );
      this.madre.set(actualizada);
      this.mensajeExito.set('Firma guardada correctamente.');
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.guardandoFirma.set(false);
    }
  }
}
