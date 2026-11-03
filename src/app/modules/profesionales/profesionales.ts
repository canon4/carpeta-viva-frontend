import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Profesional = components['schemas']['ProfesionalOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/** Lista, filtro, creación y edición de profesionales (defensor, psicosocial, nutrición...). Roles coordinador/admin. */
@Component({
  selector: 'app-profesionales',
  imports: [FormsModule],
  template: `
    <h1>Profesionales</h1>

    <form class="formulario" (ngSubmit)="filtrar()">
      <label for="filtroCargo">Filtrar por cargo</label>
      <input id="filtroCargo" name="filtroCargo" [(ngModel)]="filtroCargo" placeholder="Ejemplo: defensor" />
      <button type="submit" [disabled]="cargando()">Filtrar</button>
    </form>

    @if (cargando()) {
      <p class="nota">Cargando profesionales...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (p of profesionales(); track p.id) {
        <li class="tarjeta">
          @if (editandoId() === p.id) {
            <form class="formulario" (ngSubmit)="guardarEdicion(p)">
              <label [for]="'nombres-' + p.id">Nombres</label>
              <input [id]="'nombres-' + p.id" name="nombres" required [(ngModel)]="edicion.nombres" />
              <label [for]="'apellidos-' + p.id">Apellidos</label>
              <input [id]="'apellidos-' + p.id" name="apellidos" required [(ngModel)]="edicion.apellidos" />
              <label [for]="'cargo-' + p.id">Cargo</label>
              <input [id]="'cargo-' + p.id" name="cargo" required [(ngModel)]="edicion.cargo" />
              <label [for]="'especialidad-' + p.id">Especialidad</label>
              <input [id]="'especialidad-' + p.id" name="especialidad" [(ngModel)]="edicion.especialidad" />
              <label [for]="'registro-' + p.id">Número de registro</label>
              <input [id]="'registro-' + p.id" name="registro" [(ngModel)]="edicion.numero_registro" />
              <button type="submit" [disabled]="guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
              <button type="button" (click)="cancelarEdicion()">Cancelar</button>
            </form>
          } @else {
            <h2>{{ p.nombres }} {{ p.apellidos }}</h2>
            <p>Cargo: {{ p.cargo }}</p>
            <p>Especialidad: {{ p.especialidad || 'Sin registrar' }}</p>
            <p>Número de registro: {{ p.numero_registro || 'Sin registrar' }}</p>
            <button type="button" (click)="iniciarEdicion(p)">Editar</button>
          }
        </li>
      }
      @if (!cargando() && profesionales().length === 0) {
        <p class="nota">No hay profesionales para mostrar.</p>
      }
    </ul>

    <form class="formulario tarjeta" (ngSubmit)="crear()" #f="ngForm">
      <h2>Registrar profesional</h2>
      <label for="nombres">Nombres</label>
      <input id="nombres" name="nombres" required [(ngModel)]="nuevo.nombres" />
      <label for="apellidos">Apellidos</label>
      <input id="apellidos" name="apellidos" required [(ngModel)]="nuevo.apellidos" />
      <label for="cargo">Cargo</label>
      <input id="cargo" name="cargo" required [(ngModel)]="nuevo.cargo" placeholder="defensor, psicosocial, nutricion..." />
      <label for="especialidad">Especialidad</label>
      <input id="especialidad" name="especialidad" [(ngModel)]="nuevo.especialidad" />
      <label for="registro">Número de registro</label>
      <input id="registro" name="registro" [(ngModel)]="nuevo.numero_registro" />
      <button type="submit" [disabled]="f.invalid || guardando()">
        {{ guardando() ? 'Guardando...' : 'Crear profesional' }}
      </button>
    </form>
  `,
})
export class Profesionales {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly profesionales = signal<Profesional[]>([]);
  protected readonly cargando = signal(false);
  protected readonly guardando = signal(false);
  protected readonly error = signal('');
  protected filtroCargo = '';

  protected readonly editandoId = signal<string | null>(null);
  protected edicion = { nombres: '', apellidos: '', cargo: '', especialidad: '', numero_registro: '' };

  protected nuevo = { nombres: '', apellidos: '', cargo: '', especialidad: '', numero_registro: '' };

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
      const params: Record<string, string> = this.filtroCargo.trim() ? { cargo: this.filtroCargo.trim() } : {};
      this.profesionales.set(
        await firstValueFrom(this.http.get<Profesional[]>(`${this.config.apiUrl}/profesionales`, { params })),
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
        this.http.post<Profesional>(`${this.config.apiUrl}/profesionales`, {
          nombres: this.nuevo.nombres,
          apellidos: this.nuevo.apellidos,
          cargo: this.nuevo.cargo,
          especialidad: this.nuevo.especialidad || null,
          numero_registro: this.nuevo.numero_registro || null,
        }),
      );
      this.profesionales.set([...this.profesionales(), creado]);
      this.nuevo = { nombres: '', apellidos: '', cargo: '', especialidad: '', numero_registro: '' };
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  protected iniciarEdicion(p: Profesional): void {
    this.editandoId.set(p.id);
    this.edicion = {
      nombres: p.nombres,
      apellidos: p.apellidos,
      cargo: p.cargo,
      especialidad: p.especialidad ?? '',
      numero_registro: p.numero_registro ?? '',
    };
  }

  protected cancelarEdicion(): void {
    this.editandoId.set(null);
  }

  protected async guardarEdicion(p: Profesional): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Profesional>(`${this.config.apiUrl}/profesionales/${p.id}`, {
          nombres: this.edicion.nombres,
          apellidos: this.edicion.apellidos,
          cargo: this.edicion.cargo,
          especialidad: this.edicion.especialidad || null,
          numero_registro: this.edicion.numero_registro || null,
        }),
      );
      this.profesionales.set(this.profesionales().map((x) => (x.id === actualizado.id ? actualizado : x)));
      this.editandoId.set(null);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return 'Revise los datos ingresados: hay un valor no válido.';
    }
    return MENSAJE_GENERICO;
  }
}
