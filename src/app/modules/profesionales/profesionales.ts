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
    <div class="encabezado-modulo">
      <h1>Profesionales</h1>
      @if (!formularioAbierto()) {
        <button type="button" (click)="abrirNuevo()">Registrar profesional</button>
      }
    </div>

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="guardar()" #f="ngForm" aria-labelledby="tituloProfesional">
        <h2 id="tituloProfesional">{{ editandoId() ? 'Editar profesional' : 'Registrar profesional' }}</h2>
        <div class="campos">
          <div class="campo">
            <label for="nombres">Nombres *</label>
            <input id="nombres" name="nombres" required autocomplete="off" [(ngModel)]="datos.nombres" />
          </div>
          <div class="campo">
            <label for="apellidos">Apellidos *</label>
            <input id="apellidos" name="apellidos" required autocomplete="off" [(ngModel)]="datos.apellidos" />
          </div>
          <div class="campo">
            <label for="cargo">Cargo *</label>
            <select id="cargo" name="cargo" required [(ngModel)]="datos.cargo">
              <option value="" disabled>Seleccione el cargo</option>
              @for (c of cargos; track c.valor) {
                <option [value]="c.valor">{{ c.etiqueta }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="telefono">Teléfono</label>
            <input id="telefono" name="telefono" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="datos.telefono" />
          </div>
          <div class="campo">
            <label for="especialidad">Especialidad</label>
            <input id="especialidad" name="especialidad" autocomplete="off" [(ngModel)]="datos.especialidad" />
          </div>
          <div class="campo">
            <label for="registro">Número de registro profesional</label>
            <input id="registro" name="registro" autocomplete="off" [(ngModel)]="datos.numero_registro" />
          </div>
        </div>
        <p class="nota">El teléfono aparece en la pantalla de emergencia cuando se reporta una evasión.</p>
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardando()">{{ guardando() ? 'Guardando...' : 'Guardar' }}</button>
          <button type="button" class="boton-secundario" (click)="cerrarFormulario()">Cancelar</button>
        </div>
      </form>
    }

    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="filtros">
      <div class="campo">
        <label for="filtroCargo">Cargo</label>
        <select id="filtroCargo" [ngModel]="filtroCargo" (ngModelChange)="filtroCargo = $event; filtrar()">
          <option value="">Todos</option>
          @for (c of cargos; track c.valor) {
            <option [value]="c.valor">{{ c.etiqueta }}</option>
          }
        </select>
      </div>
    </div>

    @if (cargando()) {
      <p class="nota" role="status">Cargando profesionales...</p>
    } @else if (profesionales().length === 0) {
      <p class="nota">No hay profesionales para mostrar.</p>
    } @else {
      <table class="tabla-datos" aria-label="Profesionales">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Cargo</th>
            <th scope="col">Teléfono</th>
            <th scope="col">Registro</th>
            <th scope="col">Acciones</th>
          </tr>
        </thead>
        <tbody>
          @for (p of profesionales(); track p.id) {
            <tr>
              <td data-etiqueta="Nombre"><strong>{{ p.nombres }} {{ p.apellidos }}</strong><br /><span class="nota">{{ p.especialidad || '' }}</span></td>
              <td data-etiqueta="Cargo">{{ etiquetaCargo(p.cargo) }}</td>
              <td data-etiqueta="Teléfono">
                @if (p.telefono) { <a [href]="'tel:' + p.telefono">{{ p.telefono }}</a> } @else { <span class="estado estado-flujo-en_revision">Sin teléfono</span> }
              </td>
              <td data-etiqueta="Registro">{{ p.numero_registro || '—' }}</td>
              <td data-etiqueta="Acciones">
                <button type="button" class="boton-secundario" (click)="iniciarEdicion(p)">Editar</button>
              </td>
            </tr>
          }
        </tbody>
      </table>
    }
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
  protected readonly formularioAbierto = signal(false);
  protected readonly cargos = [
    { valor: 'defensor', etiqueta: 'Defensor de familia' },
    { valor: 'psicosocial', etiqueta: 'Psicosocial' },
    { valor: 'nutricion', etiqueta: 'Nutrición' },
    { valor: 'trabajo_social', etiqueta: 'Trabajo social' },
  ];
  private static readonly VACIO = { nombres: '', apellidos: '', cargo: '', telefono: '', especialidad: '', numero_registro: '' };
  protected datos = { ...Profesionales.VACIO };

  constructor() {
    void this.cargar();
  }

  protected etiquetaCargo(cargo: string): string {
    return this.cargos.find((c) => c.valor === cargo)?.etiqueta ?? cargo;
  }

  protected filtrar(): void {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = this.filtroCargo ? { cargo: this.filtroCargo } : {};
      this.profesionales.set(
        await firstValueFrom(this.http.get<Profesional[]>(`${this.config.apiUrl}/profesionales`, { params })),
      );
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected abrirNuevo(): void {
    this.editandoId.set(null);
    this.datos = { ...Profesionales.VACIO };
    this.formularioAbierto.set(true);
  }

  /** Un solo formulario para registrar y editar: al editar se precarga con los datos actuales. */
  protected iniciarEdicion(p: Profesional): void {
    this.editandoId.set(p.id);
    this.datos = {
      nombres: p.nombres,
      apellidos: p.apellidos,
      cargo: p.cargo,
      telefono: p.telefono ?? '',
      especialidad: p.especialidad ?? '',
      numero_registro: p.numero_registro ?? '',
    };
    this.formularioAbierto.set(true);
  }

  protected cerrarFormulario(): void {
    this.formularioAbierto.set(false);
    this.editandoId.set(null);
  }

  protected async guardar(): Promise<void> {
    this.guardando.set(true);
    this.error.set('');
    const cuerpo = {
      nombres: this.datos.nombres.trim(),
      apellidos: this.datos.apellidos.trim(),
      cargo: this.datos.cargo,
      telefono: this.datos.telefono.trim() || null,
      especialidad: this.datos.especialidad.trim() || null,
      numero_registro: this.datos.numero_registro.trim() || null,
    };
    try {
      const id = this.editandoId();
      if (id) {
        const actualizado = await firstValueFrom(
          this.http.put<Profesional>(`${this.config.apiUrl}/profesionales/${id}`, cuerpo),
        );
        this.profesionales.set(this.profesionales().map((x) => (x.id === actualizado.id ? actualizado : x)));
      } else {
        const creado = await firstValueFrom(this.http.post<Profesional>(`${this.config.apiUrl}/profesionales`, cuerpo));
        this.profesionales.set([...this.profesionales(), creado]);
      }
      this.cerrarFormulario();
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
