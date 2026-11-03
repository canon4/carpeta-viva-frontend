import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Menor = components['schemas']['MenorOut'];
type EstadoMenor = components['schemas']['EstadoMenor'];
type TipoDocumento = components['schemas']['TipoDocumento'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Lista de expedientes de menores. El backend ya filtra qué menores puede ver cada rol
 * (madre: sus asignados; profesional/defensor: los suyos; coordinador: su zona).
 */
@Component({
  selector: 'app-menores-lista',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Menores y Expedientes</h1>

    @if (mostrarPanelAgrupado()) {
      <p>
        <a routerLink="/menores/panel">Ver panel agrupado por hogar y zona</a>
      </p>
    }

    <form class="formulario" (ngSubmit)="filtrar()">
      <label for="filtroZona">Id de zona (opcional)</label>
      <input id="filtroZona" name="filtroZona" [(ngModel)]="filtroZonaId" />
      <label for="filtroHogar">Id de hogar (opcional)</label>
      <input id="filtroHogar" name="filtroHogar" [(ngModel)]="filtroHogarId" />
      <label for="filtroEstado">Estado</label>
      <select id="filtroEstado" name="filtroEstado" [(ngModel)]="filtroEstado">
        <option value="">Todos</option>
        <option value="activo">Activo</option>
        <option value="egresado">Egresado</option>
        <option value="evadido">Evadido</option>
        <option value="fallecido">Fallecido</option>
      </select>
      <button type="submit" [disabled]="cargando()">Filtrar</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando menores...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (m of menores(); track m.id) {
        <li>
          <a class="tarjeta" [routerLink]="['/menores', m.id]">
            <h2>{{ m.nombres }} {{ m.apellidos }}</h2>
            <p>Estado: {{ m.estado_actual }}</p>
            <p>Documento: {{ m.numero_documento || 'Sin documento' }}</p>
          </a>
        </li>
      }
      @if (!cargando() && menores().length === 0) {
        <p class="nota">No hay menores para mostrar con estos filtros.</p>
      }
    </ul>

    @if (puedeCrear()) {
      <form class="formulario tarjeta" (ngSubmit)="crear()" #f="ngForm">
        <h2>Registrar menor</h2>
        <label for="nombres">Nombres</label>
        <input id="nombres" name="nombres" required [(ngModel)]="nuevo.nombres" />
        <label for="apellidos">Apellidos</label>
        <input id="apellidos" name="apellidos" required [(ngModel)]="nuevo.apellidos" />
        <label for="fechaNacimiento">Fecha de nacimiento</label>
        <input id="fechaNacimiento" name="fechaNacimiento" type="date" required [(ngModel)]="nuevo.fecha_nacimiento" />
        <label for="genero">Género (opcional)</label>
        <input id="genero" name="genero" [(ngModel)]="nuevo.genero" />
        <label for="tipoDocumento">Tipo de documento</label>
        <select id="tipoDocumento" name="tipoDocumento" [(ngModel)]="nuevo.tipo_documento">
          <option value="">Sin determinar</option>
          <option value="registro_civil">Registro civil</option>
          <option value="tarjeta_identidad">Tarjeta de identidad</option>
          <option value="cedula">Cédula</option>
          <option value="pasaporte">Pasaporte</option>
          <option value="sin_documento">Sin documento</option>
        </select>
        <label for="numeroDocumento">Número de documento (opcional)</label>
        <input id="numeroDocumento" name="numeroDocumento" [(ngModel)]="nuevo.numero_documento" />
        <button type="submit" [disabled]="f.invalid || guardando()">
          {{ guardando() ? 'Guardando...' : 'Registrar menor' }}
        </button>
      </form>
    }
  `,
})
export class MenoresLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  protected readonly menores = signal<Menor[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly guardando = signal(false);

  protected filtroZonaId = '';
  protected filtroHogarId = '';
  protected filtroEstado: EstadoMenor | '' = '';

  protected nuevo: {
    nombres: string;
    apellidos: string;
    fecha_nacimiento: string;
    genero: string;
    tipo_documento: TipoDocumento | '';
    numero_documento: string;
  } = { nombres: '', apellidos: '', fecha_nacimiento: '', genero: '', tipo_documento: '', numero_documento: '' };

  // Quién puede crear un expediente nuevo (el backend valida con 403 en cualquier otro caso).
  protected readonly puedeCrear = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'defensor';
  });

  protected readonly mostrarPanelAgrupado = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor' || rol === 'coordinador';
  });

  constructor() {
    void this.cargar();
  }

  protected filtrar(): void {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = {};
      if (this.filtroZonaId.trim()) params['zona_id'] = this.filtroZonaId.trim();
      if (this.filtroHogarId.trim()) params['hogar_id'] = this.filtroHogarId.trim();
      if (this.filtroEstado) params['estado_actual'] = this.filtroEstado;
      this.menores.set(
        await firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`, { params })),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected async crear(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const creado = await firstValueFrom(
        this.http.post<Menor>(`${this.config.apiUrl}/menores`, {
          nombres: this.nuevo.nombres,
          apellidos: this.nuevo.apellidos,
          fecha_nacimiento: this.nuevo.fecha_nacimiento,
          genero: this.nuevo.genero || null,
          tipo_documento: this.nuevo.tipo_documento || null,
          numero_documento: this.nuevo.numero_documento || null,
        }),
      );
      this.menores.set([...this.menores(), creado]);
      this.nuevo = { nombres: '', apellidos: '', fecha_nacimiento: '', genero: '', tipo_documento: '', numero_documento: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para registrar un menor.';
      if (error.status === 422) return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
