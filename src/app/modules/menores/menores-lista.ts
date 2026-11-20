import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { SelectorHogar } from '../../shared/selector-hogar/selector-hogar';

type Menor = components['schemas']['MenorOut'];
type EstadoMenor = components['schemas']['EstadoMenor'];
type TipoDocumento = components['schemas']['TipoDocumento'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

const ETIQUETA_ESTADO: Record<string, string> = {
  activo: 'Activo',
  egresado: 'Egresado',
  evadido: 'Evadido',
  fallecido: 'Fallecido',
};

const ETIQUETA_DOCUMENTO: Record<string, string> = {
  registro_civil: 'Registro civil',
  tarjeta_identidad: 'Tarjeta de identidad',
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  sin_documento: 'Sin documento',
};

interface NuevoMenor {
  nombres: string;
  apellidos: string;
  fecha_nacimiento: string;
  genero: string;
  tipo_documento: TipoDocumento | '';
  numero_documento: string;
}

const NUEVO_VACIO: NuevoMenor = {
  nombres: '',
  apellidos: '',
  fecha_nacimiento: '',
  genero: '',
  tipo_documento: '',
  numero_documento: '',
};

/**
 * Lista de expedientes de menores en tabla. El backend ya filtra qué menores puede ver cada rol
 * (madre: sus asignados; profesional/defensor: los suyos; coordinador: su zona).
 * Los filtros se aplican al cambiar, sin botón; la búsqueda por nombre o documento es local.
 */
@Component({
  selector: 'app-menores-lista',
  imports: [FormsModule, RouterLink, SelectorHogar],
  template: `
    <div class="encabezado-modulo">
      <h1>Menores y expedientes</h1>
      <div class="filtros" style="margin: 0">
        @if (mostrarPanelAgrupado()) {
          <a class="boton-secundario enlace-boton" routerLink="/menores/panel">Ver por hogar y zona</a>
        }
        @if (puedeCrear() && !formularioAbierto()) {
          <button type="button" (click)="formularioAbierto.set(true)">Registrar menor</button>
        }
      </div>
    </div>

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="crear()" #f="ngForm" aria-labelledby="tituloRegistro">
        <h2 id="tituloRegistro">Registrar menor</h2>
        <div class="campos">
          <div class="campo">
            <label for="nombres">Nombres *</label>
            <input id="nombres" name="nombres" required autocomplete="off" [(ngModel)]="nuevo.nombres" />
          </div>
          <div class="campo">
            <label for="apellidos">Apellidos *</label>
            <input id="apellidos" name="apellidos" required autocomplete="off" [(ngModel)]="nuevo.apellidos" />
          </div>
          <div class="campo">
            <label for="fechaNacimiento">Fecha de nacimiento *</label>
            <input id="fechaNacimiento" name="fechaNacimiento" type="date" required [max]="hoy" [(ngModel)]="nuevo.fecha_nacimiento" />
          </div>
          <div class="campo">
            <label for="genero">Género</label>
            <select id="genero" name="genero" [(ngModel)]="nuevo.genero">
              <option value="">No informa</option>
              <option value="femenino">Femenino</option>
              <option value="masculino">Masculino</option>
              <option value="otro">Otro</option>
            </select>
          </div>
          <div class="campo">
            <label for="tipoDocumento">Tipo de documento</label>
            <select id="tipoDocumento" name="tipoDocumento" [(ngModel)]="nuevo.tipo_documento">
              <option value="">Sin determinar</option>
              @for (t of tiposDocumento; track t.valor) {
                <option [value]="t.valor">{{ t.etiqueta }}</option>
              }
            </select>
          </div>
          @if (nuevo.tipo_documento && nuevo.tipo_documento !== 'sin_documento') {
            <div class="campo">
              <label for="numeroDocumento">Número de documento</label>
              <input id="numeroDocumento" name="numeroDocumento" inputmode="numeric" autocomplete="off" [(ngModel)]="nuevo.numero_documento" />
            </div>
          }
        </div>
        <p class="nota">Los campos con * son obligatorios.</p>
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || guardando()">
            {{ guardando() ? 'Guardando...' : 'Guardar' }}
          </button>
          <button type="button" class="boton-secundario" (click)="cancelar()">Cancelar</button>
        </div>
      </form>
    }

    @if (exito()) {
      <p class="exito" role="status">{{ exito() }}</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <div class="filtros">
      <div class="campo">
        <label for="buscar">Buscar</label>
        <input id="buscar" type="search" autocomplete="off" placeholder="Nombre o documento" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" />
      </div>
      @if (puedeFiltrarHogar()) {
        <div class="campo">
          <app-selector-hogar
            etiqueta="Hogar"
            opcionVacia="Todos los hogares"
            [valor]="filtroHogarId"
            (valorChange)="filtroHogarId = $event; cargar()"
          />
        </div>
      }
      <div class="campo">
        <label for="filtroEstado">Estado</label>
        <select id="filtroEstado" [ngModel]="filtroEstado" (ngModelChange)="filtroEstado = $event; cargar()">
          <option value="">Todos</option>
          <option value="activo">Activo</option>
          <option value="egresado">Egresado</option>
          <option value="evadido">Evadido</option>
          <option value="fallecido">Fallecido</option>
        </select>
      </div>
    </div>

    @if (cargando()) {
      <p class="nota" role="status">Cargando menores...</p>
    } @else if (filtrados().length === 0) {
      <p class="nota">No hay menores para mostrar con estos filtros.</p>
    } @else {
      <p class="nota">{{ filtrados().length }} {{ filtrados().length === 1 ? 'menor' : 'menores' }}</p>
      <table class="tabla-datos" aria-label="Lista de menores">
        <thead>
          <tr>
            <th scope="col">Nombre</th>
            <th scope="col">Edad</th>
            <th scope="col">Documento</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (m of filtrados(); track m.id) {
            <tr>
              <td data-etiqueta="Nombre"><a [routerLink]="['/menores', m.id]">{{ m.nombres }} {{ m.apellidos }}</a></td>
              <td data-etiqueta="Edad">{{ edad(m.fecha_nacimiento) }}</td>
              <td data-etiqueta="Documento">{{ documento(m) }}</td>
              <td data-etiqueta="Estado"><span [class]="'estado estado-' + m.estado_actual">{{ etiquetaEstado(m.estado_actual) }}</span></td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: [`
    .enlace-boton {
      display: inline-flex; align-items: center; min-height: var(--tamano-tactil);
      padding: 0 1rem; border: 1px solid var(--color-primario); border-radius: var(--radio);
      text-decoration: none; font-weight: 600;
    }
  `],
})
export class MenoresLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  protected readonly menores = signal<Menor[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly exito = signal('');
  protected readonly guardando = signal(false);
  protected readonly formularioAbierto = signal(false);
  protected readonly busqueda = signal('');

  protected filtroHogarId = '';
  protected filtroEstado: EstadoMenor | '' = '';
  protected nuevo: NuevoMenor = { ...NUEVO_VACIO };
  protected readonly hoy = new Date().toLocaleDateString('en-CA'); // AAAA-MM-DD en hora local (toISOString usa UTC)
  protected readonly tiposDocumento = Object.entries(ETIQUETA_DOCUMENTO).map(([valor, etiqueta]) => ({ valor, etiqueta }));

  // Quién puede crear un expediente nuevo (el backend valida con 403 en cualquier otro caso).
  protected readonly puedeCrear = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'defensor';
  });

  protected readonly mostrarPanelAgrupado = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor' || rol === 'coordinador';
  });

  // La madre solo tiene su hogar: no tiene nada que filtrar. El auditor no tiene lista de hogares.
  protected readonly puedeFiltrarHogar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'profesional' || rol === 'defensor';
  });

  protected readonly filtrados = computed(() => {
    const texto = this.normalizar(this.busqueda());
    const lista = [...this.menores()].sort((a, b) =>
      `${a.nombres} ${a.apellidos}`.localeCompare(`${b.nombres} ${b.apellidos}`, 'es'),
    );
    if (!texto) return lista;
    return lista.filter((m) =>
      this.normalizar(`${m.nombres} ${m.apellidos} ${m.numero_documento ?? ''}`).includes(texto),
    );
  });

  constructor() {
    if (inject(ActivatedRoute).snapshot.queryParamMap.get('nuevo') === '1' && this.puedeCrear()) this.formularioAbierto.set(true);
    void this.cargar();
  }

  protected etiquetaEstado(estado: string): string {
    return ETIQUETA_ESTADO[estado] ?? estado;
  }

  protected documento(m: Menor): string {
    if (m.numero_documento) {
      const tipo = m.tipo_documento ? ETIQUETA_DOCUMENTO[m.tipo_documento] ?? '' : '';
      return tipo ? `${tipo} ${m.numero_documento}` : m.numero_documento;
    }
    return 'Sin documento';
  }

  protected edad(fecha: string): string {
    const nacimiento = new Date(`${fecha}T00:00:00`);
    const ahora = new Date();
    let anios = ahora.getFullYear() - nacimiento.getFullYear();
    const cumplio =
      ahora.getMonth() > nacimiento.getMonth() ||
      (ahora.getMonth() === nacimiento.getMonth() && ahora.getDate() >= nacimiento.getDate());
    if (!cumplio) anios -= 1;
    return anios === 1 ? '1 año' : `${anios} años`;
  }

  protected cancelar(): void {
    this.nuevo = { ...NUEVO_VACIO };
    this.formularioAbierto.set(false);
  }

  protected async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      const params: Record<string, string> = {};
      if (this.filtroHogarId) params['hogar_id'] = this.filtroHogarId;
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
    this.exito.set('');
    try {
      const sinNumero = !this.nuevo.tipo_documento || this.nuevo.tipo_documento === 'sin_documento';
      const creado = await firstValueFrom(
        this.http.post<Menor>(`${this.config.apiUrl}/menores`, {
          nombres: this.nuevo.nombres.trim(),
          apellidos: this.nuevo.apellidos.trim(),
          fecha_nacimiento: this.nuevo.fecha_nacimiento,
          genero: this.nuevo.genero || null,
          tipo_documento: this.nuevo.tipo_documento || null,
          numero_documento: sinNumero ? null : this.nuevo.numero_documento.trim() || null,
        }),
      );
      this.menores.set([...this.menores(), creado]);
      this.exito.set(`Se registró a ${creado.nombres} ${creado.apellidos}.`);
      this.cancelar();
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.guardando.set(false);
    }
  }

  private normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para registrar un menor.';
      if (error.status === 422) return 'Revise los datos: hay un valor no válido o el documento ya está registrado.';
    }
    return MENSAJE_GENERICO;
  }
}
