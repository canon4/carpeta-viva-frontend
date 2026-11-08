import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Menor = components['schemas']['MenorOut'];
type MenorHistoria = components['schemas']['MenorHistoryOut'];
type Familiar = components['schemas']['FamiliarOut'];
type Permiso = components['schemas']['PermisoOut'];
type Asignacion = components['schemas']['AsignacionOut'];
type EstadoMenor = components['schemas']['EstadoMenor'];
type TipoDocumento = components['schemas']['TipoDocumento'];
type Parentesco = components['schemas']['Parentesco'];
type EstadoVital = components['schemas']['EstadoVital'];
type SeccionSensible = components['schemas']['SeccionSensible'];
type Documento = components['schemas']['DocumentoOut'];
type Reporte = components['schemas']['ReporteOut'];
type SeccionExpediente = components['schemas']['SeccionExpedienteOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';
const SIN_ACCESO = 'No tiene acceso a esta sección del expediente.';

/**
 * Expediente de un menor: datos básicos, familia, salud y psicosocial (documentos y reportes del
 * módulo Gestión Documental, Fase 3), permisos de la madre sobre secciones sensibles, asignación
 * vigente e historial. El backend decide qué secciones devuelve según el rol; aquí solo se
 * refleja lo que llega (403 se muestra como "sin acceso", no como error genérico).
 */
@Component({
  selector: 'app-menor-detalle',
  imports: [FormsModule, RouterLink],
  template: `
    @if (cargando()) {
      <p class="nota">Cargando expediente...</p>
    }
    @if (errorGeneral()) {
      <p class="error" role="alert">{{ errorGeneral() }}</p>
    }

    @if (menor()) {
      <h1>{{ menor()!.nombres }} {{ menor()!.apellidos }}</h1>
      <p><a routerLink="/menores">Volver a la lista</a></p>

      <section class="tarjeta">
        <h2>Datos básicos</h2>
        @if (!editando()) {
          <p>Fecha de nacimiento: {{ menor()!.fecha_nacimiento }}</p>
          <p>Género: {{ menor()!.genero || 'Sin registrar' }}</p>
          <p>Tipo de documento: {{ menor()!.tipo_documento || 'Sin determinar' }}</p>
          <p>Número de documento: {{ menor()!.numero_documento || 'Sin documento' }}</p>
          <p>Estado: {{ menor()!.estado_actual }}</p>
          @if (puedeEditar()) {
            <button type="button" (click)="iniciarEdicion()">Editar datos básicos</button>
          }
        } @else {
          <form class="formulario" (ngSubmit)="guardarEdicion()">
            <label for="eNombres">Nombres</label>
            <input id="eNombres" name="eNombres" required [(ngModel)]="edicion.nombres" />
            <label for="eApellidos">Apellidos</label>
            <input id="eApellidos" name="eApellidos" required [(ngModel)]="edicion.apellidos" />
            <label for="eGenero">Género</label>
            <input id="eGenero" name="eGenero" [(ngModel)]="edicion.genero" />
            <label for="eEstado">Estado</label>
            <select id="eEstado" name="eEstado" [(ngModel)]="edicion.estado_actual">
              <option value="activo">Activo</option>
              <option value="egresado">Egresado</option>
              <option value="evadido">Evadido</option>
              <option value="fallecido">Fallecido</option>
            </select>
            <label for="eMotivo">Motivo del cambio (opcional)</label>
            <input id="eMotivo" name="eMotivo" [(ngModel)]="edicion.motivo" />
            <button type="submit" [disabled]="guardandoEdicion()">
              {{ guardandoEdicion() ? 'Guardando...' : 'Guardar cambios' }}
            </button>
            <button type="button" (click)="cancelarEdicion()">Cancelar</button>
          </form>
        }
      </section>

      <section class="tarjeta">
        <h2>Asignación vigente</h2>
        @if (asignacionVigente()) {
          <p>Hogar: {{ asignacionVigente()!.hogar_id }}</p>
          <p>Desde: {{ asignacionVigente()!.fecha_inicio }}</p>
        } @else {
          <p class="nota">Este menor no tiene una asignación vigente a un hogar.</p>
        }
        <p>
          <a [routerLink]="['/asignaciones']" [queryParams]="{ menor_id: menorId }">
            Ver asignaciones y traslados de este menor
          </a>
        </p>
      </section>

      <section class="tarjeta">
        <h2>Familia</h2>
        @if (sinAccesoFamilia()) {
          <p class="nota">{{ sinAccesoFamilia() }}</p>
        } @else {
          <ul class="lista-simple">
            @for (f of familiares(); track f.id) {
              <li>
                <p>Parentesco: {{ f.parentesco }}</p>
                <p>Nombres: {{ f.nombres || 'Desconocido' }}</p>
                <p>Identificación: {{ f.numero_identificacion || 'Sin registrar' }}</p>
                <p>Teléfono: {{ f.telefono || 'Sin registrar' }}</p>
                <p>Estado vital: {{ f.estado_vital }}</p>
              </li>
            }
            @if (familiares().length === 0) {
              <p class="nota">No hay información de familiares registrada.</p>
            }
          </ul>
          @if (puedeEditar()) {
            <form class="formulario" (ngSubmit)="crearFamiliar()" #ff="ngForm">
              <h3>Agregar familiar</h3>
              <label for="parentesco">Parentesco</label>
              <select id="parentesco" name="parentesco" required [(ngModel)]="nuevoFamiliar.parentesco">
                <option value="padre">Padre</option>
                <option value="madre">Madre</option>
                <option value="otro">Otro</option>
              </select>
              <label for="nombresF">Nombres (opcional)</label>
              <input id="nombresF" name="nombresF" [(ngModel)]="nuevoFamiliar.nombres" />
              <label for="identificacionF">Identificación (opcional)</label>
              <input id="identificacionF" name="identificacionF" [(ngModel)]="nuevoFamiliar.numero_identificacion" />
              <label for="telefonoF">Teléfono (opcional)</label>
              <input id="telefonoF" name="telefonoF" [(ngModel)]="nuevoFamiliar.telefono" />
              <label for="estadoVital">Estado vital</label>
              <select id="estadoVital" name="estadoVital" [(ngModel)]="nuevoFamiliar.estado_vital">
                <option value="vivo">Vivo</option>
                <option value="fallecido">Fallecido</option>
                <option value="desconocido">Desconocido</option>
              </select>
              <button type="submit" [disabled]="ff.invalid || guardandoFamiliar()">
                {{ guardandoFamiliar() ? 'Guardando...' : 'Agregar familiar' }}
              </button>
            </form>
          }
        }
      </section>

      <section class="tarjeta">
        <h2>Salud</h2>
        @if (sinAccesoSalud()) {
          <p class="nota">{{ sinAccesoSalud() }}</p>
        } @else {
          @if (cargandoSalud()) {
            <p class="nota">Cargando historial médico...</p>
          }
          <ul class="lista-simple">
            @for (d of saludDocumentos(); track d.id) {
              <li>
                <a [routerLink]="['/documentos', d.id]">{{ d.titulo }} ({{ d.nombre_original }})</a>
                — {{ d.estado_flujo }}
              </li>
            }
            @for (r of saludReportes(); track r.id) {
              <li>Informe {{ r.tipo_reporte }} — {{ r.created_at }}</li>
            }
          </ul>
          @if (!cargandoSalud() && saludDocumentos().length === 0 && saludReportes().length === 0) {
            <p class="nota">No hay documentos ni informes médicos registrados todavía.</p>
          }
          <p>
            <a [routerLink]="['/documentos']" [queryParams]="{ menor_id: menorId, categoria: 'salud' }">
              Subir o ver documentos de salud
            </a>
          </p>
        }
      </section>

      <section class="tarjeta">
        <h2>Psicosocial</h2>
        @if (sinAccesoPsicosocial()) {
          <p class="nota">{{ sinAccesoPsicosocial() }}</p>
        } @else {
          @if (cargandoPsicosocial()) {
            <p class="nota">Cargando historial psicosocial...</p>
          }
          <ul class="lista-simple">
            @for (d of psicosocialDocumentos(); track d.id) {
              <li>
                <a [routerLink]="['/documentos', d.id]">{{ d.titulo }} ({{ d.nombre_original }})</a>
                — {{ d.estado_flujo }}
              </li>
            }
            @for (r of psicosocialReportes(); track r.id) {
              <li>Informe {{ r.tipo_reporte }} — {{ r.created_at }}</li>
            }
          </ul>
          @if (!cargandoPsicosocial() && psicosocialDocumentos().length === 0 && psicosocialReportes().length === 0) {
            <p class="nota">No hay documentos ni informes psicosociales registrados todavía.</p>
          }
          <p>
            <a [routerLink]="['/documentos']" [queryParams]="{ menor_id: menorId, categoria: 'psicosocial' }">
              Subir o ver documentos psicosociales
            </a>
          </p>
        }
      </section>

      <section class="tarjeta">
        <h2>Gestión documental</h2>
        <p>
          <a [routerLink]="['/documentos']" [queryParams]="{ menor_id: menorId }">
            Ver todos los documentos de este menor (identidad, educación, actas de traslado y más)
          </a>
        </p>
      </section>

      @if (puedeVerIa()) {
        <section class="tarjeta">
          <h2>Asistente de IA</h2>
          <p>
            <a [routerLink]="['/ia', 'menores', menorId, 'resumen']">Ver resumen de IA de este expediente</a>
          </p>
          <p>
            <a [routerLink]="['/ia']" [queryParams]="{ menor_id: menorId }">
              Hacer una pregunta en lenguaje natural sobre este menor
            </a>
          </p>
          @if (puedeRedactar()) {
            <p>
              <a [routerLink]="['/ia', 'redaccion']" [queryParams]="{ menor_id: menorId }">
                Apoyo a la redacción de un informe para este menor
              </a>
            </p>
          }
        </section>
      }

      <section class="tarjeta">
        <h2>Reportes</h2>
        <p>
          <a [routerLink]="['/reportes', 'menor', menorId]">Ver reporte de este menor</a>
        </p>
      </section>

      @if (puedeVerArchivo()) {
        <section class="tarjeta">
          <h2>Archivo y Cierre</h2>
          <p>
            <a [routerLink]="['/archivo', 'menores', menorId]">
              Ver estado de archivo{{ puedeArchivar() ? ' o archivar este expediente' : '' }}
            </a>
          </p>
        </section>
      }

      <section class="tarjeta">
        <h2>Citas y Recordatorios</h2>
        <p>
          <a [routerLink]="['/citas']" [queryParams]="{ menor_id: menorId }">
            Ver citas médicas, psicosociales y reuniones de familia de este menor
          </a>
        </p>
      </section>

      <section class="tarjeta">
        <h2>Alertas y Evasiones</h2>
        <p>
          <a [routerLink]="['/alertas']" [queryParams]="{ menor_id: menorId }">
            Ver alertas de este menor
          </a>
        </p>
        <p>
          <a [routerLink]="['/alertas/reportar-evasion']" [queryParams]="{ menor_id: menorId }">
            Reportar una evasión de este menor
          </a>
        </p>
      </section>

      <section class="tarjeta">
        <h2>Permisos de la madre sobre secciones sensibles</h2>
        @if (sinAccesoPermisos()) {
          <p class="nota">{{ sinAccesoPermisos() }}</p>
        } @else {
          <ul class="lista-simple">
            @for (p of permisos(); track p.id) {
              <li>
                <p>Sección: {{ p.seccion }}</p>
                <p>Usuario (madre): {{ p.usuario_id }}</p>
                <p>Estado: {{ p.activo ? 'Otorgado' : 'Revocado' }}</p>
                @if (p.activo && esDefensor()) {
                  <button type="button" (click)="revocarPermiso(p)" [disabled]="guardandoPermiso()">
                    Revocar
                  </button>
                }
              </li>
            }
            @if (permisos().length === 0) {
              <p class="nota">No se ha otorgado ningún permiso todavía.</p>
            }
          </ul>

          @if (esDefensor()) {
            <form class="formulario" (ngSubmit)="crearPermiso()" #fp="ngForm">
              <h3>Otorgar permiso a la madre</h3>
              <label for="seccionPermiso">Sección</label>
              <select id="seccionPermiso" name="seccionPermiso" required [(ngModel)]="nuevoPermiso.seccion">
                <option value="familia">Familia</option>
                <option value="salud">Salud</option>
                <option value="psicosocial">Psicosocial</option>
              </select>
              <label for="usuarioPermiso">Id de usuario de la madre</label>
              <input id="usuarioPermiso" name="usuarioPermiso" required [(ngModel)]="nuevoPermiso.usuario_id" />
              <label for="notasPermiso">Notas (opcional)</label>
              <input id="notasPermiso" name="notasPermiso" [(ngModel)]="nuevoPermiso.notas" />
              <button type="submit" [disabled]="fp.invalid || guardandoPermiso()">
                {{ guardandoPermiso() ? 'Guardando...' : 'Otorgar permiso' }}
              </button>
            </form>
          } @else {
            <p class="nota">
              Solo el defensor asignado a este menor puede otorgar o revocar permisos sobre secciones
              sensibles.
            </p>
          }
        }
      </section>

      <section class="tarjeta">
        <h2>Historial de cambios</h2>
        @if (!mostrarHistorial()) {
          <button type="button" (click)="cargarHistorial()">Ver historial</button>
        } @else {
          @if (cargandoHistorial()) {
            <p class="nota">Cargando historial...</p>
          }
          @if (errorHistorial()) {
            <p class="error" role="alert">{{ errorHistorial() }}</p>
          }
          <table class="tabla">
            <thead>
              <tr>
                <th>Versión</th>
                <th>Nombres</th>
                <th>Estado</th>
                <th>Motivo</th>
                <th>Fecha del cambio</th>
              </tr>
            </thead>
            <tbody>
              @for (h of historial(); track h.id) {
                <tr>
                  <td>{{ h.version }}</td>
                  <td>{{ h.nombres }} {{ h.apellidos }}</td>
                  <td>{{ h.estado_actual }}</td>
                  <td>{{ h.motivo || 'Sin motivo registrado' }}</td>
                  <td>{{ h.created_at }}</td>
                </tr>
              }
            </tbody>
          </table>
          @if (!cargandoHistorial() && historial().length === 0) {
            <p class="nota">Este menor no tiene cambios anteriores registrados.</p>
          }
        }
      </section>
    }
  `,
})
export class MenorDetalle {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  protected readonly menorId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly menor = signal<Menor | null>(null);
  protected readonly cargando = signal(false);
  protected readonly errorGeneral = signal('');

  protected readonly familiares = signal<Familiar[]>([]);
  protected readonly sinAccesoFamilia = signal('');
  protected readonly guardandoFamiliar = signal(false);
  protected nuevoFamiliar: {
    parentesco: Parentesco;
    nombres: string;
    numero_identificacion: string;
    telefono: string;
    estado_vital: EstadoVital;
  } = { parentesco: 'madre', nombres: '', numero_identificacion: '', telefono: '', estado_vital: 'desconocido' };

  protected readonly cargandoSalud = signal(false);
  protected readonly sinAccesoSalud = signal('');
  protected readonly saludDocumentos = signal<Documento[]>([]);
  protected readonly saludReportes = signal<Reporte[]>([]);

  protected readonly cargandoPsicosocial = signal(false);
  protected readonly sinAccesoPsicosocial = signal('');
  protected readonly psicosocialDocumentos = signal<Documento[]>([]);
  protected readonly psicosocialReportes = signal<Reporte[]>([]);

  protected readonly permisos = signal<Permiso[]>([]);
  protected readonly sinAccesoPermisos = signal('');
  protected readonly guardandoPermiso = signal(false);
  protected nuevoPermiso: { seccion: SeccionSensible; usuario_id: string; notas: string } = {
    seccion: 'familia',
    usuario_id: '',
    notas: '',
  };

  protected readonly asignacionVigente = signal<Asignacion | null>(null);

  protected readonly editando = signal(false);
  protected readonly guardandoEdicion = signal(false);
  protected edicion: {
    nombres: string;
    apellidos: string;
    genero: string;
    estado_actual: EstadoMenor;
    motivo: string;
  } = { nombres: '', apellidos: '', genero: '', estado_actual: 'activo', motivo: '' };

  protected readonly mostrarHistorial = signal(false);
  protected readonly cargandoHistorial = signal(false);
  protected readonly errorHistorial = signal('');
  protected readonly historial = signal<MenorHistoria[]>([]);

  protected readonly esDefensor = computed(() => this.auth.rol() === 'defensor');
  protected readonly puedeEditar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'defensor';
  });
  protected readonly puedeVerIa = computed(() => {
    const rol = this.auth.rol();
    return rol === 'madre' || rol === 'profesional' || rol === 'defensor' || rol === 'coordinador' || rol === 'admin';
  });
  protected readonly puedeRedactar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor';
  });
  protected readonly puedeVerArchivo = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'auditor';
  });
  protected readonly puedeArchivar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    if (!this.menorId) {
      this.errorGeneral.set('No se indicó qué menor mostrar.');
      return;
    }
    this.cargando.set(true);
    this.errorGeneral.set('');
    try {
      const menor = await firstValueFrom(
        this.http.get<Menor>(`${this.config.apiUrl}/menores/${this.menorId}`),
      );
      this.menor.set(menor);
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'No tiene acceso al expediente de este menor.'
          : MENSAJE_GENERICO,
      );
      this.cargando.set(false);
      return;
    }
    await Promise.all([
      this.cargarFamiliares(),
      this.cargarPermisos(),
      this.cargarAsignacionVigente(),
      this.cargarSeccion('salud'),
      this.cargarSeccion('psicosocial'),
    ]);
    this.cargando.set(false);
  }

  private async cargarSeccion(seccion: 'salud' | 'psicosocial'): Promise<void> {
    const cargandoSignal = seccion === 'salud' ? this.cargandoSalud : this.cargandoPsicosocial;
    const sinAccesoSignal = seccion === 'salud' ? this.sinAccesoSalud : this.sinAccesoPsicosocial;
    const documentosSignal = seccion === 'salud' ? this.saludDocumentos : this.psicosocialDocumentos;
    const reportesSignal = seccion === 'salud' ? this.saludReportes : this.psicosocialReportes;
    cargandoSignal.set(true);
    try {
      const datos = await firstValueFrom(
        this.http.get<SeccionExpediente>(`${this.config.apiUrl}/documentos/menor/${this.menorId}/seccion/${seccion}`),
      );
      documentosSignal.set(datos.documentos);
      reportesSignal.set(datos.reportes);
      sinAccesoSignal.set('');
    } catch (e) {
      sinAccesoSignal.set(
        e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO,
      );
    } finally {
      cargandoSignal.set(false);
    }
  }

  private async cargarFamiliares(): Promise<void> {
    try {
      this.familiares.set(
        await firstValueFrom(
          this.http.get<Familiar[]>(`${this.config.apiUrl}/menores/${this.menorId}/familiares`),
        ),
      );
      this.sinAccesoFamilia.set('');
    } catch (e) {
      this.sinAccesoFamilia.set(
        e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO,
      );
    }
  }

  private async cargarPermisos(): Promise<void> {
    try {
      this.permisos.set(
        await firstValueFrom(
          this.http.get<Permiso[]>(`${this.config.apiUrl}/menores/${this.menorId}/permisos`),
        ),
      );
      this.sinAccesoPermisos.set('');
    } catch (e) {
      this.sinAccesoPermisos.set(
        e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO,
      );
    }
  }

  private async cargarAsignacionVigente(): Promise<void> {
    try {
      this.asignacionVigente.set(
        await firstValueFrom(
          this.http.get<Asignacion | null>(
            `${this.config.apiUrl}/asignaciones/menor/${this.menorId}/vigente`,
          ),
        ),
      );
    } catch {
      this.asignacionVigente.set(null);
    }
  }

  protected iniciarEdicion(): void {
    const m = this.menor();
    if (!m) return;
    this.edicion = {
      nombres: m.nombres,
      apellidos: m.apellidos,
      genero: m.genero ?? '',
      estado_actual: m.estado_actual as EstadoMenor,
      motivo: '',
    };
    this.editando.set(true);
  }

  protected cancelarEdicion(): void {
    this.editando.set(false);
  }

  protected async guardarEdicion(): Promise<void> {
    this.guardandoEdicion.set(true);
    this.errorGeneral.set('');
    try {
      const actualizado = await firstValueFrom(
        this.http.put<Menor>(`${this.config.apiUrl}/menores/${this.menorId}`, {
          nombres: this.edicion.nombres,
          apellidos: this.edicion.apellidos,
          genero: this.edicion.genero || null,
          estado_actual: this.edicion.estado_actual,
          motivo: this.edicion.motivo || null,
        }),
      );
      this.menor.set(actualizado);
      this.editando.set(false);
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'Su rol no tiene permiso para editar este expediente.'
          : MENSAJE_GENERICO,
      );
    } finally {
      this.guardandoEdicion.set(false);
    }
  }

  protected async crearFamiliar(): Promise<void> {
    this.guardandoFamiliar.set(true);
    try {
      const creado = await firstValueFrom(
        this.http.post<Familiar>(`${this.config.apiUrl}/menores/${this.menorId}/familiares`, {
          parentesco: this.nuevoFamiliar.parentesco,
          nombres: this.nuevoFamiliar.nombres || null,
          numero_identificacion: this.nuevoFamiliar.numero_identificacion || null,
          telefono: this.nuevoFamiliar.telefono || null,
          estado_vital: this.nuevoFamiliar.estado_vital,
        }),
      );
      this.familiares.set([...this.familiares(), creado]);
      this.nuevoFamiliar = { parentesco: 'madre', nombres: '', numero_identificacion: '', telefono: '', estado_vital: 'desconocido' };
    } catch (e) {
      this.sinAccesoFamilia.set(
        e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO,
      );
    } finally {
      this.guardandoFamiliar.set(false);
    }
  }

  protected async crearPermiso(): Promise<void> {
    this.guardandoPermiso.set(true);
    try {
      const creado = await firstValueFrom(
        this.http.post<Permiso>(`${this.config.apiUrl}/menores/${this.menorId}/permisos`, {
          seccion: this.nuevoPermiso.seccion,
          usuario_id: this.nuevoPermiso.usuario_id,
          notas: this.nuevoPermiso.notas || null,
        }),
      );
      this.permisos.set([...this.permisos(), creado]);
      this.nuevoPermiso = { seccion: 'familia', usuario_id: '', notas: '' };
    } catch (e) {
      this.sinAccesoPermisos.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'Solo el defensor asignado a este menor puede otorgar permisos.'
          : MENSAJE_GENERICO,
      );
    } finally {
      this.guardandoPermiso.set(false);
    }
  }

  protected async revocarPermiso(p: Permiso): Promise<void> {
    this.guardandoPermiso.set(true);
    try {
      const actualizado = await firstValueFrom(
        this.http.delete<Permiso>(`${this.config.apiUrl}/menores/${this.menorId}/permisos/${p.id}`),
      );
      this.permisos.set(this.permisos().map((x) => (x.id === actualizado.id ? actualizado : x)));
    } catch (e) {
      this.sinAccesoPermisos.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'Solo el defensor asignado a este menor puede revocar permisos.'
          : MENSAJE_GENERICO,
      );
    } finally {
      this.guardandoPermiso.set(false);
    }
  }

  protected async cargarHistorial(): Promise<void> {
    this.mostrarHistorial.set(true);
    this.cargandoHistorial.set(true);
    this.errorHistorial.set('');
    try {
      this.historial.set(
        await firstValueFrom(
          this.http.get<MenorHistoria[]>(`${this.config.apiUrl}/menores/${this.menorId}/historial`),
        ),
      );
    } catch {
      this.errorHistorial.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoHistorial.set(false);
    }
  }
}
