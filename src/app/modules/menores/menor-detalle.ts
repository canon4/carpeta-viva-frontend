import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { NgTemplateOutlet } from '@angular/common';
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
type HogarVigente = components['schemas']['HogarVigenteOut'];
type EstadoMenor = components['schemas']['EstadoMenor'];
type Parentesco = components['schemas']['Parentesco'];
type EstadoVital = components['schemas']['EstadoVital'];
type SeccionSensible = components['schemas']['SeccionSensible'];
type Documento = components['schemas']['DocumentoOut'];
type Reporte = components['schemas']['ReporteOut'];
type SeccionExpediente = components['schemas']['SeccionExpedienteOut'];

type Pestana = 'resumen' | 'familia' | 'salud' | 'psicosocial' | 'permisos' | 'historial';

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';
const SIN_ACCESO = 'No tiene acceso a esta sección del expediente.';

const ETIQUETAS: Record<string, string> = {
  registro_civil: 'Registro civil',
  tarjeta_identidad: 'Tarjeta de identidad',
  cedula: 'Cédula',
  pasaporte: 'Pasaporte',
  sin_documento: 'Sin documento',
  activo: 'Activo',
  egresado: 'Egresado',
  evadido: 'Evadido',
  fallecido: 'Fallecido',
  femenino: 'Femenino',
  masculino: 'Masculino',
  otro: 'Otro',
  padre: 'Padre',
  madre: 'Madre',
  vivo: 'Vivo',
  desconocido: 'Desconocido',
  borrador: 'Borrador',
  en_revision: 'En revisión',
  aprobado: 'Aprobado',
  devuelto: 'Devuelto',
  familia: 'Familia',
  salud: 'Salud',
  psicosocial: 'Psicosocial',
};

const SECCIONES: { valor: SeccionSensible; titulo: string; descripcion: string }[] = [
  { valor: 'familia', titulo: 'Familia', descripcion: 'Datos de contacto del padre, la madre y otros familiares.' },
  { valor: 'salud', titulo: 'Salud', descripcion: 'Historia médica, documentos de salud y notas de citas médicas.' },
  { valor: 'psicosocial', titulo: 'Psicosocial', descripcion: 'Informes y documentos de seguimiento psicosocial.' },
];

/**
 * Expediente de un menor: ficha arriba con los datos clave y las acciones, y el detalle en
 * pestañas (resumen, familia, salud, psicosocial, permisos e historial). El backend decide qué
 * secciones devuelve según el rol; un 403 se muestra como "sin acceso", no como error.
 */
@Component({
  selector: 'app-menor-detalle',
  imports: [FormsModule, RouterLink, NgTemplateOutlet],
  template: `
    <p><a routerLink="/menores" class="volver">← Menores</a></p>

    @if (cargando()) {
      <p class="nota" role="status">Cargando expediente...</p>
    }
    @if (errorGeneral()) {
      <p class="error" role="alert">{{ errorGeneral() }}</p>
    }

    @if (menor(); as m) {
      <section class="ficha" aria-labelledby="nombreMenor">
        <div class="ficha-datos">
          <div class="ficha-titulo">
            <h1 id="nombreMenor">{{ m.nombres }} {{ m.apellidos }}</h1>
            <span [class]="'estado estado-' + m.estado_actual">{{ etiqueta(m.estado_actual) }}</span>
          </div>
          <p>
            {{ edad(m.fecha_nacimiento) }} · nació el {{ fecha(m.fecha_nacimiento) }}
            @if (m.genero) { · {{ etiqueta(m.genero) }} }
          </p>
          <p>{{ m.numero_documento ? etiqueta(m.tipo_documento ?? '') + ' ' + m.numero_documento : 'Sin documento de identidad' }}</p>
          <p>
            @if (hogar(); as h) {
              Hogar de {{ h.madre_nombre || 'madre sin registrar' }}{{ h.zona_nombre ? ' · ' + h.zona_nombre : '' }} · desde {{ fecha(h.fecha_inicio) }}
            } @else if (!cargando()) {
              Sin hogar asignado actualmente
            }
          </p>
        </div>
        <div class="ficha-acciones">
          @if (puedeEditar()) {
            <button type="button" class="boton-secundario" (click)="iniciarEdicion()">Editar datos</button>
          }
          @if (puedeVerIa()) {
            <a class="boton-secundario enlace-boton" [routerLink]="['/ia']" [queryParams]="{ menor_id: menorId }">Preguntar a la IA</a>
          }
          @if (puedeReportarEvasion()) {
            <a class="enlace-boton emergencia" [routerLink]="['/alertas/reportar-evasion']" [queryParams]="{ menor_id: menorId }">Reportar evasión</a>
          }
        </div>
      </section>

      @if (editando()) {
        <form class="panel-formulario" (ngSubmit)="guardarEdicion()" #fe="ngForm" aria-labelledby="tituloEditar">
          <h2 id="tituloEditar">Editar datos del menor</h2>
          <div class="campos">
            <div class="campo">
              <label for="eNombres">Nombres *</label>
              <input id="eNombres" name="eNombres" required autocomplete="off" [(ngModel)]="edicion.nombres" />
            </div>
            <div class="campo">
              <label for="eApellidos">Apellidos *</label>
              <input id="eApellidos" name="eApellidos" required autocomplete="off" [(ngModel)]="edicion.apellidos" />
            </div>
            <div class="campo">
              <label for="eGenero">Género</label>
              <select id="eGenero" name="eGenero" [(ngModel)]="edicion.genero">
                <option value="">No informa</option>
                <option value="femenino">Femenino</option>
                <option value="masculino">Masculino</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div class="campo">
              <label for="eEstado">Estado *</label>
              <select id="eEstado" name="eEstado" [(ngModel)]="edicion.estado_actual">
                <option value="activo">Activo</option>
                <option value="egresado">Egresado</option>
                <option value="evadido">Evadido</option>
                <option value="fallecido">Fallecido</option>
              </select>
            </div>
            <div class="campo">
              <label for="eMotivo">Motivo del cambio</label>
              <input id="eMotivo" name="eMotivo" autocomplete="off" [(ngModel)]="edicion.motivo" />
            </div>
          </div>
          <p class="nota">Los datos anteriores quedan guardados en el historial.</p>
          <div class="acciones">
            <button type="submit" [disabled]="fe.invalid || guardandoEdicion()">{{ guardandoEdicion() ? 'Guardando...' : 'Guardar' }}</button>
            <button type="button" class="boton-secundario" (click)="editando.set(false)">Cancelar</button>
          </div>
        </form>
      }

      <div class="pestanas" role="tablist" aria-label="Secciones del expediente">
        @for (p of pestanasVisibles(); track p.id) {
          <button type="button" role="tab" [attr.aria-selected]="pestana() === p.id" [class.activa]="pestana() === p.id" (click)="cambiarPestana(p.id)">{{ p.titulo }}</button>
        }
      </div>

      @switch (pestana()) {
        @case ('resumen') {
          <section role="tabpanel" aria-label="Resumen">
            <div class="enlaces-expediente">
              <a [routerLink]="['/documentos']" [queryParams]="{ menor_id: menorId }">
                <strong>Documentos</strong><span class="nota">Identidad, educación, actas y más</span>
              </a>
              <a [routerLink]="['/citas']" [queryParams]="{ menor_id: menorId }">
                <strong>Citas</strong><span class="nota">Médicas, psicosociales y con la familia</span>
              </a>
              <a [routerLink]="['/alertas']" [queryParams]="{ menor_id: menorId }">
                <strong>Alertas</strong><span class="nota">Evasiones, visitas y documentos faltantes</span>
              </a>
              <a [routerLink]="['/asignaciones']" [queryParams]="{ menor_id: menorId }">
                <strong>Hogares</strong><span class="nota">Ingresos y traslados</span>
              </a>
              <a [routerLink]="['/reportes', 'menor', menorId]">
                <strong>Reporte</strong><span class="nota">Resumen del expediente para imprimir</span>
              </a>
              @if (puedeVerIa()) {
                <a [routerLink]="['/ia', 'menores', menorId, 'resumen']">
                  <strong>Resumen con IA</strong><span class="nota">Con cita a cada documento</span>
                </a>
              }
              @if (puedeRedactar()) {
                <a [routerLink]="['/ia', 'redaccion']" [queryParams]="{ menor_id: menorId }">
                  <strong>Apoyo a la redacción</strong><span class="nota">Borrador de un informe</span>
                </a>
              }
              @if (puedeVerArchivo()) {
                <a [routerLink]="['/archivo', 'menores', menorId]">
                  <strong>Archivo y cierre</strong><span class="nota">{{ puedeArchivar() ? 'Estado o archivar el expediente' : 'Estado del archivo' }}</span>
                </a>
              }
            </div>
          </section>
        }

        @case ('familia') {
          <section role="tabpanel" aria-label="Familia">
            @if (sinAccesoFamilia()) {
              <p class="nota">{{ sinAccesoFamilia() }}</p>
            } @else {
              @if (puedeRegistrarFamilia() && !formularioFamiliar()) {
                <div class="acciones" style="margin-bottom: 1rem">
                  <button type="button" (click)="formularioFamiliar.set(true)">Agregar familiar</button>
                </div>
              }
              @if (formularioFamiliar()) {
                <form class="panel-formulario" (ngSubmit)="crearFamiliar()" #ff="ngForm" aria-label="Agregar familiar">
                  <div class="campos">
                    <div class="campo">
                      <label for="parentesco">Parentesco *</label>
                      <select id="parentesco" name="parentesco" required [(ngModel)]="nuevoFamiliar.parentesco">
                        <option value="madre">Madre</option>
                        <option value="padre">Padre</option>
                        <option value="otro">Otro familiar</option>
                      </select>
                    </div>
                    <div class="campo">
                      <label for="nombresF">Nombre completo</label>
                      <input id="nombresF" name="nombresF" autocomplete="off" [(ngModel)]="nuevoFamiliar.nombres" />
                    </div>
                    <div class="campo">
                      <label for="estadoVital">¿Vive? *</label>
                      <select id="estadoVital" name="estadoVital" [(ngModel)]="nuevoFamiliar.estado_vital">
                        <option value="vivo">Sí</option>
                        <option value="fallecido">No, falleció</option>
                        <option value="desconocido">No se sabe</option>
                      </select>
                    </div>
                    <div class="campo">
                      <label for="telefonoF">Teléfono</label>
                      <input id="telefonoF" name="telefonoF" type="tel" inputmode="tel" autocomplete="off" [(ngModel)]="nuevoFamiliar.telefono" />
                    </div>
                    <div class="campo">
                      <label for="identificacionF">Número de identificación</label>
                      <input id="identificacionF" name="identificacionF" inputmode="numeric" autocomplete="off" [(ngModel)]="nuevoFamiliar.numero_identificacion" />
                    </div>
                  </div>
                  <div class="acciones">
                    <button type="submit" [disabled]="ff.invalid || guardandoFamiliar()">{{ guardandoFamiliar() ? 'Guardando...' : 'Guardar' }}</button>
                    <button type="button" class="boton-secundario" (click)="formularioFamiliar.set(false)">Cancelar</button>
                  </div>
                </form>
              }
              @if (familiares().length === 0) {
                <p class="nota">No hay familiares registrados.</p>
              } @else {
                <table class="tabla-datos" aria-label="Familiares">
                  <thead>
                    <tr><th scope="col">Parentesco</th><th scope="col">Nombre</th><th scope="col">Teléfono</th><th scope="col">Identificación</th><th scope="col">¿Vive?</th></tr>
                  </thead>
                  <tbody>
                    @for (f of familiares(); track f.id) {
                      <tr>
                        <td data-etiqueta="Parentesco"><strong>{{ etiqueta(f.parentesco) }}</strong></td>
                        <td data-etiqueta="Nombre">{{ f.nombres || 'Desconocido' }}</td>
                        <td data-etiqueta="Teléfono">
                          @if (f.telefono) { <a [href]="'tel:' + f.telefono">{{ f.telefono }}</a> } @else { — }
                        </td>
                        <td data-etiqueta="Identificación">{{ f.numero_identificacion || '—' }}</td>
                        <td data-etiqueta="¿Vive?">{{ f.estado_vital === 'vivo' ? 'Sí' : f.estado_vital === 'fallecido' ? 'Falleció' : 'No se sabe' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              }
            }
          </section>
        }

        @case ('salud') {
          <section role="tabpanel" aria-label="Salud">
            <ng-container *ngTemplateOutlet="seccionSensible; context: { $implicit: 'salud' }" />
          </section>
        }

        @case ('psicosocial') {
          <section role="tabpanel" aria-label="Psicosocial">
            <ng-container *ngTemplateOutlet="seccionSensible; context: { $implicit: 'psicosocial' }" />
          </section>
        }

        @case ('permisos') {
          <section role="tabpanel" aria-label="Permisos de la madre">
            @if (sinAccesoPermisos()) {
              <p class="nota">{{ sinAccesoPermisos() }}</p>
            } @else if (!hogar()?.madre_usuario_id) {
              <p class="nota">El menor no tiene una madre con cuenta en su hogar actual, así que no hay a quién dar permisos.</p>
            } @else {
              <p>
                Qué puede ver <strong>{{ hogar()!.madre_nombre }}</strong>, la madre del hogar actual, además de los datos básicos.
                @if (!esDefensor()) {
                  <span class="nota">Solo el defensor asignado puede cambiarlo.</span>
                }
              </p>
              @if (errorPermiso()) {
                <p class="error" role="alert">{{ errorPermiso() }}</p>
              }
              <ul class="interruptores">
                @for (s of secciones; track s.valor) {
                  <li>
                    <div>
                      <strong>{{ s.titulo }}</strong>
                      <span class="nota">{{ s.descripcion }}</span>
                    </div>
                    <label class="interruptor">
                      <input
                        type="checkbox"
                        role="switch"
                        [checked]="!!permisoActivo(s.valor)"
                        [disabled]="!esDefensor() || guardandoPermiso() === s.valor"
                        (change)="alternarPermiso(s.valor, $any($event.target).checked)"
                      />
                      <span>{{ permisoActivo(s.valor) ? 'Puede ver' : 'No puede ver' }}</span>
                    </label>
                  </li>
                }
              </ul>
              <p class="nota">Al terminar la asignación del menor en este hogar, los permisos se retiran solos.</p>
            }
          </section>
        }

        @case ('historial') {
          <section role="tabpanel" aria-label="Historial de cambios">
            @if (cargandoHistorial()) {
              <p class="nota" role="status">Cargando historial...</p>
            } @else if (errorHistorial()) {
              <p class="error" role="alert">{{ errorHistorial() }}</p>
            } @else if (historial().length === 0) {
              <p class="nota">Este expediente no tiene cambios anteriores.</p>
            } @else {
              <table class="tabla-datos" aria-label="Historial de cambios">
                <thead>
                  <tr><th scope="col">Fecha</th><th scope="col">Datos anteriores</th><th scope="col">Estado anterior</th><th scope="col">Motivo</th></tr>
                </thead>
                <tbody>
                  @for (h of historial(); track h.id) {
                    <tr>
                      <td data-etiqueta="Fecha">{{ fecha(h.created_at) }}</td>
                      <td data-etiqueta="Datos anteriores">{{ h.nombres }} {{ h.apellidos }}</td>
                      <td data-etiqueta="Estado anterior">{{ etiqueta(h.estado_actual) }}</td>
                      <td data-etiqueta="Motivo">{{ h.motivo || 'Sin motivo' }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            }
          </section>
        }
      }

      <ng-template #seccionSensible let-seccion>
        @if (sinAcceso(seccion)) {
          <p class="nota">{{ sinAcceso(seccion) }}</p>
        } @else {
          <div class="acciones" style="margin-bottom: 1rem">
            <a class="boton-secundario enlace-boton" [routerLink]="['/documentos']" [queryParams]="{ menor_id: menorId, categoria: seccion, nuevo: '1' }">Subir documento de {{ etiqueta(seccion).toLowerCase() }}</a>
          </div>
          @if (cargandoSeccion(seccion)) {
            <p class="nota" role="status">Cargando...</p>
          } @else if (documentosDe(seccion).length === 0 && reportesDe(seccion).length === 0) {
            <p class="nota">No hay documentos ni informes de {{ etiqueta(seccion).toLowerCase() }} todavía.</p>
          } @else {
            <table class="tabla-datos" [attr.aria-label]="'Documentos de ' + etiqueta(seccion)">
              <thead>
                <tr><th scope="col">Documento</th><th scope="col">Tipo</th><th scope="col">Fecha</th><th scope="col">Estado</th></tr>
              </thead>
              <tbody>
                @for (d of documentosDe(seccion); track d.id) {
                  <tr>
                    <td data-etiqueta="Documento"><a [routerLink]="['/documentos', d.id]">{{ d.titulo }}</a></td>
                    <td data-etiqueta="Tipo">Archivo</td>
                    <td data-etiqueta="Fecha">{{ fecha(d.created_at) }}</td>
                    <td data-etiqueta="Estado"><span [class]="'estado estado-flujo-' + d.estado_flujo">{{ etiqueta(d.estado_flujo) }}</span></td>
                  </tr>
                }
                @for (r of reportesDe(seccion); track r.id) {
                  <tr>
                    <td data-etiqueta="Documento"><strong>Informe {{ r.tipo_reporte }}</strong></td>
                    <td data-etiqueta="Tipo">Informe profesional</td>
                    <td data-etiqueta="Fecha">{{ fecha(r.created_at) }}</td>
                    <td data-etiqueta="Estado"><span class="estado estado-flujo-aprobado">Registrado</span></td>
                  </tr>
                }
              </tbody>
            </table>
          }
        }
      </ng-template>
    }
  `,
  styles: [`
    .volver { text-decoration: none; font-weight: 600; color: var(--color-primario); }
    .ficha {
      display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem;
      background: var(--color-superficie); border: 1px solid var(--color-borde); border-radius: var(--radio);
      padding: 1rem 1.25rem; margin-bottom: 1rem;
    }
    .ficha-titulo { display: flex; flex-wrap: wrap; align-items: center; gap: 0.75rem; }
    .ficha-titulo h1 { margin: 0; }
    .ficha-datos p { margin: 0.2rem 0 0; }
    .ficha-acciones { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 0.5rem; }
    .enlace-boton {
      display: inline-flex; align-items: center; min-height: var(--tamano-tactil); padding: 0 1rem;
      border: 1px solid var(--color-primario); border-radius: var(--radio); text-decoration: none; font-weight: 600;
    }
    .enlace-boton.emergencia { background: #b00020; border-color: #b00020; color: #fff; }
    .enlace-boton.emergencia:hover { background: #8a0019; }
    .enlaces-expediente { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(14rem, 1fr)); }
    .enlaces-expediente a {
      display: grid; gap: 0.15rem; padding: 0.9rem 1rem; text-decoration: none; color: inherit;
      background: var(--color-superficie); border: 1px solid var(--color-borde); border-radius: var(--radio);
    }
    .enlaces-expediente a:hover { border-color: var(--color-primario); }
    .enlaces-expediente strong { color: var(--color-primario); }
    .interruptores { list-style: none; margin: 1rem 0; padding: 0; display: grid; gap: 0.5rem; }
    .interruptores li {
      display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 1rem;
      padding: 0.75rem 1rem; background: var(--color-superficie); border: 1px solid var(--color-borde); border-radius: var(--radio);
    }
    .interruptores li div { display: grid; gap: 0.1rem; }
    .interruptor { display: flex; align-items: center; gap: 0.6rem; font-weight: 600; min-height: var(--tamano-tactil); cursor: pointer; }
    .interruptor input {
      appearance: none; width: 3rem; height: 1.6rem; min-height: auto; padding: 0; border-radius: 999px;
      background: #b9c6c3; border: none; position: relative; cursor: pointer; transition: background-color 0.15s ease;
    }
    .interruptor input::after {
      content: ''; position: absolute; top: 0.2rem; left: 0.2rem; width: 1.2rem; height: 1.2rem;
      border-radius: 50%; background: #fff; transition: transform 0.15s ease;
    }
    .interruptor input:checked { background: var(--color-primario); }
    .interruptor input:checked::after { transform: translateX(1.4rem); }
    .interruptor input:disabled { cursor: not-allowed; opacity: 0.7; }
    @media (prefers-reduced-motion: reduce) { .interruptor input, .interruptor input::after { transition: none; } }
  `],
})
export class MenorDetalle {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  protected readonly menorId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  protected readonly secciones = SECCIONES;

  protected readonly menor = signal<Menor | null>(null);
  protected readonly hogar = signal<HogarVigente | null>(null);
  protected readonly cargando = signal(false);
  protected readonly errorGeneral = signal('');
  protected readonly pestana = signal<Pestana>('resumen');

  protected readonly familiares = signal<Familiar[]>([]);
  protected readonly sinAccesoFamilia = signal('');
  protected readonly guardandoFamiliar = signal(false);
  protected readonly formularioFamiliar = signal(false);
  protected nuevoFamiliar: {
    parentesco: Parentesco;
    nombres: string;
    numero_identificacion: string;
    telefono: string;
    estado_vital: EstadoVital;
  } = { parentesco: 'madre', nombres: '', numero_identificacion: '', telefono: '', estado_vital: 'vivo' };

  private readonly secciones$ = {
    salud: { cargando: signal(false), sinAcceso: signal(''), documentos: signal<Documento[]>([]), reportes: signal<Reporte[]>([]) },
    psicosocial: { cargando: signal(false), sinAcceso: signal(''), documentos: signal<Documento[]>([]), reportes: signal<Reporte[]>([]) },
  };

  protected readonly permisos = signal<Permiso[]>([]);
  protected readonly sinAccesoPermisos = signal('');
  protected readonly errorPermiso = signal('');
  protected readonly guardandoPermiso = signal<SeccionSensible | null>(null);

  protected readonly editando = signal(false);
  protected readonly guardandoEdicion = signal(false);
  protected edicion: { nombres: string; apellidos: string; genero: string; estado_actual: EstadoMenor; motivo: string } = {
    nombres: '',
    apellidos: '',
    genero: '',
    estado_actual: 'activo',
    motivo: '',
  };

  protected readonly cargandoHistorial = signal(false);
  protected readonly errorHistorial = signal('');
  protected readonly historial = signal<MenorHistoria[]>([]);
  private historialCargado = false;

  protected readonly esDefensor = computed(() => this.auth.rol() === 'defensor');
  protected readonly esMadre = computed(() => this.auth.rol() === 'madre');
  protected readonly puedeEditar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin' || rol === 'defensor';
  });
  // Solo los profesionales asignados registran familiares (supuesto S19).
  protected readonly puedeRegistrarFamilia = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor';
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
  protected readonly puedeReportarEvasion = computed(() => this.auth.rol() !== 'auditor' && this.menor()?.estado_actual === 'activo');

  protected readonly pestanasVisibles = computed(() => {
    const lista: { id: Pestana; titulo: string }[] = [
      { id: 'resumen', titulo: 'Resumen' },
      { id: 'familia', titulo: 'Familia' },
      { id: 'salud', titulo: 'Salud' },
      { id: 'psicosocial', titulo: 'Psicosocial' },
    ];
    if (!this.esMadre()) {
      lista.push({ id: 'permisos', titulo: 'Permisos de la madre' }, { id: 'historial', titulo: 'Historial' });
    }
    return lista;
  });

  constructor() {
    void this.cargar();
  }

  protected etiqueta(valor: string): string {
    return ETIQUETAS[valor] ?? valor;
  }

  protected fecha(iso: string): string {
    const f = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
    if (Number.isNaN(f.getTime())) return iso;
    return f.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  protected edad(fechaNacimiento: string): string {
    const n = new Date(`${fechaNacimiento}T00:00:00`);
    const hoy = new Date();
    let anios = hoy.getFullYear() - n.getFullYear();
    if (hoy.getMonth() < n.getMonth() || (hoy.getMonth() === n.getMonth() && hoy.getDate() < n.getDate())) anios -= 1;
    return anios === 1 ? '1 año' : `${anios} años`;
  }

  protected sinAcceso(seccion: 'salud' | 'psicosocial'): string {
    return this.secciones$[seccion].sinAcceso();
  }
  protected cargandoSeccion(seccion: 'salud' | 'psicosocial'): boolean {
    return this.secciones$[seccion].cargando();
  }
  protected documentosDe(seccion: 'salud' | 'psicosocial'): Documento[] {
    return this.secciones$[seccion].documentos();
  }
  protected reportesDe(seccion: 'salud' | 'psicosocial'): Reporte[] {
    return this.secciones$[seccion].reportes();
  }

  protected cambiarPestana(p: Pestana): void {
    this.pestana.set(p);
    if (p === 'historial' && !this.historialCargado) void this.cargarHistorial();
  }

  /** Permiso activo de la madre del hogar vigente para esa sección, si existe. */
  protected permisoActivo(seccion: SeccionSensible): Permiso | undefined {
    const madre = this.hogar()?.madre_usuario_id;
    return this.permisos().find((p) => p.activo && p.seccion === seccion && p.usuario_id === madre);
  }

  private async cargar(): Promise<void> {
    if (!this.menorId) {
      this.errorGeneral.set('No se indicó qué menor mostrar.');
      return;
    }
    this.cargando.set(true);
    this.errorGeneral.set('');
    try {
      this.menor.set(await firstValueFrom(this.http.get<Menor>(`${this.config.apiUrl}/menores/${this.menorId}`)));
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403 ? 'No tiene acceso al expediente de este menor.' : MENSAJE_GENERICO,
      );
      this.cargando.set(false);
      return;
    }
    await Promise.all([
      this.cargarHogar(),
      this.cargarFamiliares(),
      this.esMadre() ? Promise.resolve() : this.cargarPermisos(),
      this.cargarSeccion('salud'),
      this.cargarSeccion('psicosocial'),
    ]);
    this.cargando.set(false);
  }

  private async cargarHogar(): Promise<void> {
    try {
      this.hogar.set(
        await firstValueFrom(this.http.get<HogarVigente | null>(`${this.config.apiUrl}/menores/${this.menorId}/hogar-vigente`)),
      );
    } catch {
      this.hogar.set(null);
    }
  }

  private async cargarSeccion(seccion: 'salud' | 'psicosocial'): Promise<void> {
    const s = this.secciones$[seccion];
    s.cargando.set(true);
    try {
      const datos = await firstValueFrom(
        this.http.get<SeccionExpediente>(`${this.config.apiUrl}/documentos/menor/${this.menorId}/seccion/${seccion}`),
      );
      s.documentos.set(datos.documentos);
      s.reportes.set(datos.reportes);
      s.sinAcceso.set('');
    } catch (e) {
      s.sinAcceso.set(e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO);
    } finally {
      s.cargando.set(false);
    }
  }

  private async cargarFamiliares(): Promise<void> {
    try {
      this.familiares.set(await firstValueFrom(this.http.get<Familiar[]>(`${this.config.apiUrl}/menores/${this.menorId}/familiares`)));
      this.sinAccesoFamilia.set('');
    } catch (e) {
      this.sinAccesoFamilia.set(e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO);
    }
  }

  private async cargarPermisos(): Promise<void> {
    try {
      this.permisos.set(await firstValueFrom(this.http.get<Permiso[]>(`${this.config.apiUrl}/menores/${this.menorId}/permisos`)));
      this.sinAccesoPermisos.set('');
    } catch (e) {
      this.sinAccesoPermisos.set(e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO);
    }
  }

  protected iniciarEdicion(): void {
    const m = this.menor();
    if (!m) return;
    this.edicion = { nombres: m.nombres, apellidos: m.apellidos, genero: m.genero ?? '', estado_actual: m.estado_actual as EstadoMenor, motivo: '' };
    this.editando.set(true);
  }

  protected async guardarEdicion(): Promise<void> {
    this.guardandoEdicion.set(true);
    this.errorGeneral.set('');
    try {
      this.menor.set(
        await firstValueFrom(
          this.http.put<Menor>(`${this.config.apiUrl}/menores/${this.menorId}`, {
            nombres: this.edicion.nombres.trim(),
            apellidos: this.edicion.apellidos.trim(),
            genero: this.edicion.genero || null,
            estado_actual: this.edicion.estado_actual,
            motivo: this.edicion.motivo.trim() || null,
          }),
        ),
      );
      this.editando.set(false);
      this.historialCargado = false;
    } catch (e) {
      this.errorGeneral.set(
        e instanceof HttpErrorResponse && e.status === 403 ? 'Su rol no tiene permiso para editar este expediente.' : MENSAJE_GENERICO,
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
          nombres: this.nuevoFamiliar.nombres.trim() || null,
          numero_identificacion: this.nuevoFamiliar.numero_identificacion.trim() || null,
          telefono: this.nuevoFamiliar.telefono.trim() || null,
          estado_vital: this.nuevoFamiliar.estado_vital,
        }),
      );
      this.familiares.set([...this.familiares(), creado]);
      this.nuevoFamiliar = { parentesco: 'madre', nombres: '', numero_identificacion: '', telefono: '', estado_vital: 'vivo' };
      this.formularioFamiliar.set(false);
    } catch (e) {
      this.sinAccesoFamilia.set(e instanceof HttpErrorResponse && e.status === 403 ? SIN_ACCESO : MENSAJE_GENERICO);
    } finally {
      this.guardandoFamiliar.set(false);
    }
  }

  /** Interruptor: encendido otorga el permiso a la madre del hogar vigente; apagado lo revoca. */
  protected async alternarPermiso(seccion: SeccionSensible, encender: boolean): Promise<void> {
    this.guardandoPermiso.set(seccion);
    this.errorPermiso.set('');
    try {
      if (encender) {
        // Sin usuario_id: el backend usa la madre del hogar vigente (la única válida).
        const creado = await firstValueFrom(
          this.http.post<Permiso>(`${this.config.apiUrl}/menores/${this.menorId}/permisos`, { seccion }),
        );
        this.permisos.set([...this.permisos().filter((p) => p.id !== creado.id), creado]);
      } else {
        const activo = this.permisoActivo(seccion);
        if (!activo) return;
        const actualizado = await firstValueFrom(
          this.http.delete<Permiso>(`${this.config.apiUrl}/menores/${this.menorId}/permisos/${activo.id}`),
        );
        this.permisos.set(this.permisos().map((x) => (x.id === actualizado.id ? actualizado : x)));
      }
    } catch (e) {
      this.errorPermiso.set(
        e instanceof HttpErrorResponse && e.status === 403
          ? 'Solo el defensor asignado a este menor puede cambiar los permisos.'
          : e instanceof HttpErrorResponse && e.status === 422 && typeof e.error?.detail === 'string'
            ? e.error.detail
            : MENSAJE_GENERICO,
      );
      // Se recarga para que el interruptor muestre el estado real.
      await this.cargarPermisos();
    } finally {
      this.guardandoPermiso.set(null);
    }
  }

  protected async cargarHistorial(): Promise<void> {
    this.cargandoHistorial.set(true);
    this.errorHistorial.set('');
    try {
      this.historial.set(await firstValueFrom(this.http.get<MenorHistoria[]>(`${this.config.apiUrl}/menores/${this.menorId}/historial`)));
      this.historialCargado = true;
    } catch {
      this.errorHistorial.set(MENSAJE_GENERICO);
    } finally {
      this.cargandoHistorial.set(false);
    }
  }
}
