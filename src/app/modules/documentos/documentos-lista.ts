import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import { CatalogosService } from '../../core/catalogos/catalogos';
import { SelectorMenor } from '../../shared/selector-menor/selector-menor';
import { SelectorHogar } from '../../shared/selector-hogar/selector-hogar';
import type { components } from '../../core/api/schema';
import {
  CATEGORIAS_HOGAR,
  CATEGORIAS_MENOR,
  ESTADOS_FLUJO,
  GRUPO_CATEGORIA_HOGAR,
  GRUPO_CATEGORIA_MENOR,
  etiquetaCategoria,
  etiquetaEstadoFlujo,
  formatoTamanio,
  type CategoriaOpcion,
} from './categorias';

type Documento = components['schemas']['DocumentoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Lista de documentos (filtrada por menor u hogar) con subida de un documento nuevo.
 * El auditor ve una lista de solo metadatos (`GET /documentos/auditor`), sin formulario de carga
 * y sin ningún enlace de descarga: el backend ya rechaza su descarga, pero la vista tampoco la ofrece.
 */
@Component({
  selector: 'app-documentos-lista',
  imports: [FormsModule, RouterLink, SelectorMenor, SelectorHogar],
  styles: [`
    .atajos { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 1rem; }
    .atajo { background: var(--color-superficie); color: var(--color-texto); border: 1px solid var(--color-borde); border-radius: 999px; min-height: 40px; padding: 0 1rem; font-weight: 600; }
    .atajo:hover:not(:disabled) { background: var(--color-primario-suave); border-color: var(--color-primario); color: var(--color-primario); }
    .atajo.activo, .atajo.activo:hover { background: var(--color-primario); border-color: var(--color-primario); color: #fff; }
  `],
  template: `
    <div class="encabezado-modulo">
      <h1>Gestión documental</h1>
      @if (!esAuditor() && puedeSubir() && !formularioAbierto()) {
        <button type="button" (click)="formularioAbierto.set(true)">Subir documento</button>
      }
    </div>

    @if (esAuditor()) {
      <p class="nota">
        Vista de auditoría: solo metadatos de documentos no sensibles. Nunca se muestra ni se
        descarga el contenido del archivo.
      </p>
    }

    @if (formularioAbierto()) {
      <form class="panel-formulario" (ngSubmit)="subir()" #f="ngForm" aria-labelledby="tituloSubir">
        <h2 id="tituloSubir">Subir documento</h2>
        <div class="campos">
          <div class="campo">
            <label for="nArchivo">Archivo o foto *</label>
            <input id="nArchivo" name="nArchivo" type="file" required accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,image/*" (change)="seleccionarArchivo($event)" />
          </div>
          <div class="campo">
            <label for="destino">El documento es de *</label>
            <select id="destino" name="destino" [(ngModel)]="nuevo.destino" (ngModelChange)="nuevo.categoria = ''">
              <option value="menor">Un menor</option>
              <option value="hogar">El hogar</option>
            </select>
          </div>
          <div class="campo">
            @if (nuevo.destino === 'menor') {
              <app-selector-menor etiqueta="Menor *" [(valor)]="nuevo.menor_id" [requerido]="true" />
            } @else {
              <app-selector-hogar etiqueta="Hogar *" [(valor)]="nuevo.hogar_id" [requerido]="true" />
            }
          </div>
          <div class="campo">
            <label for="nCategoria">Categoría *</label>
            <select id="nCategoria" name="nCategoria" required [(ngModel)]="nuevo.categoria">
              <option value="" disabled>Seleccione una categoría</option>
              @for (c of (nuevo.destino === 'menor' ? categoriasMenor() : categoriasHogar()); track c.valor) {
                <option [value]="c.valor">{{ c.etiqueta }}</option>
              }
            </select>
          </div>
          <div class="campo">
            <label for="nTitulo">Título *</label>
            <input id="nTitulo" name="nTitulo" required autocomplete="off" [(ngModel)]="nuevo.titulo" />
          </div>
          @if (puedeMigrar()) {
            <div class="campo">
              <label class="casilla">
                <input type="checkbox" name="nMigracion" [(ngModel)]="nuevo.migracion" />
                Es digitalización del historial físico
              </label>
              @if (nuevo.migracion) {
                <label for="nMotivo">Motivo de la migración *</label>
                <input id="nMotivo" name="nMotivo" required autocomplete="off" [(ngModel)]="nuevo.motivo" />
              }
            </div>
          }
        </div>
        <p class="nota">El título se llena con el nombre del archivo; puede cambiarlo. Los campos con * son obligatorios.</p>
        <div class="acciones">
          <button type="submit" [disabled]="f.invalid || !archivoSeleccionado() || subiendo()">
            {{ subiendo() ? 'Subiendo...' : 'Subir' }}
          </button>
          <button type="button" class="boton-secundario" (click)="formularioAbierto.set(false)">Cancelar</button>
        </div>
      </form>
    }

    @if (exito()) {
      <p class="exito" role="status">{{ exito() }}</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    @if (!esAuditor()) {
      <div class="atajos" role="group" aria-label="Atajos de estado">
        @for (a of atajos(); track a.estado) {
          <button type="button" class="atajo" [class.activo]="filtroEstado === a.estado" [attr.aria-pressed]="filtroEstado === a.estado" (click)="filtroEstado = a.estado; filtrar()">{{ a.etiqueta }}</button>
        }
      </div>
      <div class="filtros">
        <div class="campo">
          <label for="buscar">Buscar</label>
          <input id="buscar" type="search" autocomplete="off" placeholder="Título del documento" [ngModel]="busqueda()" (ngModelChange)="busqueda.set($event)" />
        </div>
        <div class="campo">
          <app-selector-menor etiqueta="Menor" opcionVacia="Todos los menores" [valor]="filtroMenorId" (valorChange)="filtroMenorId = $event; filtrar()" />
        </div>
        <!-- La madre tiene un solo hogar: filtrar por él ocultaría los documentos de sus niños. -->
        @if (!esMadre()) {
          <div class="campo">
            <app-selector-hogar etiqueta="Hogar" opcionVacia="Todos los hogares" [valor]="filtroHogarId" (valorChange)="filtroHogarId = $event; filtrar()" />
          </div>
        }
        <div class="campo">
          <label for="fCategoria">Categoría</label>
          <select id="fCategoria" [ngModel]="filtroCategoria" (ngModelChange)="filtroCategoria = $event; filtrar()">
            <option value="">Todas</option>
            @for (c of todasCategorias(); track c.valor) {
              <option [value]="c.valor">{{ c.etiqueta }}</option>
            }
          </select>
        </div>
      </div>
    }

    @if (cargando()) {
      <p class="nota" role="status">Cargando documentos...</p>
    } @else if (visibles().length === 0) {
      <p class="nota">No hay documentos para mostrar.</p>
    } @else {
      <table class="tabla-datos" aria-label="Documentos">
        <thead>
          <tr>
            <th scope="col">Título</th>
            <th scope="col">De</th>
            <th scope="col">Categoría</th>
            <th scope="col">Fecha</th>
            <th scope="col">Estado</th>
          </tr>
        </thead>
        <tbody>
          @for (d of visibles(); track d.id) {
            <tr>
              <td data-etiqueta="Título"><a [routerLink]="['/documentos', d.id]">{{ d.titulo }}</a></td>
              <td data-etiqueta="De">{{ d.menor_id ? nombreMenor(d.menor_id) : 'Hogar' }}</td>
              <td data-etiqueta="Categoría">{{ etiquetaCategoria(d.categoria, todasCategorias()) }}</td>
              <td data-etiqueta="Fecha">{{ fecha(d.created_at) }}</td>
              <td data-etiqueta="Estado"><span [class]="'estado estado-flujo-' + d.estado_flujo">{{ etiquetaEstadoFlujo(d.estado_flujo) }}</span></td>
            </tr>
          }
        </tbody>
      </table>
    }
  `,
})
export class DocumentosLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly catalogos = inject(CatalogosService);

  protected readonly etiquetaCategoria = etiquetaCategoria;
  protected readonly etiquetaEstadoFlujo = etiquetaEstadoFlujo;
  protected readonly formatoTamanio = formatoTamanio;
  // Valor por defecto embebido (ADR-0013 sección 7, punto 1); se reemplaza al cargar el catálogo
  // administrable. Si la llamada falla, queda este respaldo.
  protected readonly categoriasMenor = signal<CategoriaOpcion[]>(CATEGORIAS_MENOR);
  protected readonly categoriasHogar = signal<CategoriaOpcion[]>(CATEGORIAS_HOGAR);
  protected readonly todasCategorias = computed(() => [
    ...this.categoriasMenor(),
    ...this.categoriasHogar().filter((h) => h.valor !== 'otros'),
  ]);
  protected readonly estados = ESTADOS_FLUJO;

  protected readonly documentos = signal<Documento[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly subiendo = signal(false);
  protected readonly archivoSeleccionado = signal<File | null>(null);
  protected readonly formularioAbierto = signal(false);
  protected readonly exito = signal('');

  protected filtroMenorId = '';
  protected filtroHogarId = '';
  protected filtroCategoria = '';
  protected filtroEstado = '';

  protected readonly esAuditor = computed(() => this.auth.rol() === 'auditor');
  protected readonly esMadre = computed(() => this.auth.rol() === 'madre');
  protected readonly busqueda = signal('');
  private readonly nombres = signal<Record<string, string>>({});

  /** Atajos de estado según el rol: la madre corrige; el profesional revisa. */
  protected readonly atajos = computed(() => {
    if (this.esMadre()) {
      return [
        { estado: '', etiqueta: 'Todos' },
        { estado: 'devuelto', etiqueta: 'Para corregir' },
        { estado: 'borrador', etiqueta: 'Sin enviar' },
        { estado: 'en_revision', etiqueta: 'En revisión' },
        { estado: 'aprobado', etiqueta: 'Aprobados' },
      ];
    }
    return [
      { estado: '', etiqueta: 'Todos' },
      { estado: 'en_revision', etiqueta: 'Por revisar' },
      { estado: 'devuelto', etiqueta: 'Devueltos' },
      { estado: 'aprobado', etiqueta: 'Aprobados' },
    ];
  });

  /** Búsqueda local por título, más recientes primero. */
  protected readonly visibles = computed(() => {
    const texto = this.normalizar(this.busqueda());
    const lista = [...this.documentos()].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return texto ? lista.filter((d) => this.normalizar(d.titulo).includes(texto)) : lista;
  });

  protected nombreMenor(id: string): string {
    return this.nombres()[id] ?? 'Menor';
  }

  protected fecha(iso: string): string {
    const f = new Date(iso);
    return Number.isNaN(f.getTime()) ? iso : f.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  private normalizar(texto: string): string {
    return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }

  private async cargarNombres(): Promise<void> {
    try {
      const menores = await firstValueFrom(this.http.get<{ id: string; nombres: string; apellidos: string }[]>(`${this.config.apiUrl}/menores`));
      this.nombres.set(Object.fromEntries(menores.map((m) => [m.id, `${m.nombres} ${m.apellidos}`])));
    } catch {
      /* sin nombres se muestra "Menor" */
    }
  }
  protected readonly puedeSubir = computed(() => {
    const rol = this.auth.rol();
    return rol === 'madre' || rol === 'profesional' || rol === 'defensor' || rol === 'coordinador' || rol === 'admin';
  });
  protected readonly puedeMigrar = computed(() => {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  });

  protected nuevo: {
    destino: 'menor' | 'hogar';
    menor_id: string;
    hogar_id: string;
    categoria: string;
    titulo: string;
    migracion: boolean;
    motivo: string;
  } = { destino: 'menor', menor_id: '', hogar_id: '', categoria: '', titulo: '', migracion: false, motivo: '' };

  constructor() {
    this.filtroMenorId = this.route.snapshot.queryParamMap.get('menor_id') ?? '';
    this.filtroHogarId = this.route.snapshot.queryParamMap.get('hogar_id') ?? '';
    this.filtroCategoria = this.route.snapshot.queryParamMap.get('categoria') ?? '';
    this.filtroEstado = this.route.snapshot.queryParamMap.get('estado') ?? '';
    if (this.route.snapshot.queryParamMap.get('nuevo') === '1' && this.puedeSubir()) this.formularioAbierto.set(true);
    if (this.filtroMenorId) this.nuevo.menor_id = this.filtroMenorId;
    if (this.filtroCategoria) this.nuevo.categoria = this.filtroCategoria;
    if (this.filtroHogarId) {
      this.nuevo.hogar_id = this.filtroHogarId;
      this.nuevo.destino = 'hogar';
    }
    void this.cargar();
    void this.cargarCatalogos();
    void this.cargarNombres();
  }

  private async cargarCatalogos(): Promise<void> {
    // Si la API falla, se deja el valor por defecto embebido ya puesto en la señal.
    try {
      this.categoriasMenor.set(await this.catalogos.obtener(GRUPO_CATEGORIA_MENOR));
    } catch {
      /* se mantiene CATEGORIAS_MENOR como respaldo */
    }
    try {
      this.categoriasHogar.set(await this.catalogos.obtener(GRUPO_CATEGORIA_HOGAR));
    } catch {
      /* se mantiene CATEGORIAS_HOGAR como respaldo */
    }
  }

  protected filtrar(): void {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set('');
    try {
      if (this.esAuditor()) {
        this.documentos.set(
          await firstValueFrom(this.http.get<Documento[]>(`${this.config.apiUrl}/documentos/auditor`)),
        );
      } else {
        const params: Record<string, string> = {};
        if (this.filtroMenorId.trim()) params['menor_id'] = this.filtroMenorId.trim();
        if (this.filtroHogarId.trim()) params['hogar_id'] = this.filtroHogarId.trim();
        if (this.filtroCategoria) params['categoria'] = this.filtroCategoria;
        if (this.filtroEstado) params['estado_flujo'] = this.filtroEstado;
        this.documentos.set(
          await firstValueFrom(this.http.get<Documento[]>(`${this.config.apiUrl}/documentos`, { params })),
        );
      }
    } catch {
      this.error.set(MENSAJE_GENERICO);
    } finally {
      this.cargando.set(false);
    }
  }

  protected seleccionarArchivo(evento: Event): void {
    const input = evento.target as HTMLInputElement;
    const archivo = input.files?.[0] ?? null;
    this.archivoSeleccionado.set(archivo);
    // Un campo menos que escribir: el título parte del nombre del archivo, sin extensión.
    if (archivo && !this.nuevo.titulo.trim()) {
      this.nuevo.titulo = archivo.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
    }
  }

  protected async subir(): Promise<void> {
    const archivo = this.archivoSeleccionado();
    if (!archivo) return;
    this.subiendo.set(true);
    this.error.set('');
    try {
      const datos = new FormData();
      datos.append('archivo', archivo);
      datos.append('categoria', this.nuevo.categoria);
      datos.append('titulo', this.nuevo.titulo);
      if (this.nuevo.destino === 'menor') {
        datos.append('menor_id', this.nuevo.menor_id);
      } else {
        datos.append('hogar_id', this.nuevo.hogar_id);
      }
      if (this.puedeMigrar() && this.nuevo.migracion) {
        datos.append('migracion', 'true');
        datos.append('motivo', this.nuevo.motivo);
      }
      const creado = await firstValueFrom(this.http.post<Documento>(`${this.config.apiUrl}/documentos`, datos));
      this.documentos.set([creado, ...this.documentos()]);
      this.exito.set(`Se subió "${creado.titulo}" en borrador. Ábralo para enviarlo a revisión.`);
      this.formularioAbierto.set(false);
      this.nuevo = {
        destino: this.nuevo.destino,
        menor_id: this.nuevo.destino === 'menor' ? this.nuevo.menor_id : '',
        hogar_id: this.nuevo.destino === 'hogar' ? this.nuevo.hogar_id : '',
        categoria: '',
        titulo: '',
        migracion: false,
        motivo: '',
      };
      this.archivoSeleccionado.set(null);
    } catch (e) {
      this.error.set(this.mensajeError(e));
    } finally {
      this.subiendo.set(false);
    }
  }

  private mensajeError(error: unknown): string {
    if (error instanceof HttpErrorResponse) {
      if (error.status === 403) return 'Su rol no tiene permiso para esta acción.';
      if (error.status === 422) {
        const detalle = (error.error as { detail?: unknown })?.detail;
        return typeof detalle === 'string' ? detalle : 'Revise los datos ingresados: hay un valor no válido.';
      }
    }
    return MENSAJE_GENERICO;
  }
}
