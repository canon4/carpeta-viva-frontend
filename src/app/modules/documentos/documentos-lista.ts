import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import { CATEGORIAS_HOGAR, CATEGORIAS_MENOR, ESTADOS_FLUJO, etiquetaCategoria, etiquetaEstadoFlujo, formatoTamanio } from './categorias';

type Documento = components['schemas']['DocumentoOut'];

const MENSAJE_GENERICO = 'No se pudo completar la acción. Intente de nuevo.';

/**
 * Lista de documentos (filtrada por menor u hogar) con subida de un documento nuevo.
 * El auditor ve una lista de solo metadatos (`GET /documentos/auditor`), sin formulario de carga
 * y sin ningún enlace de descarga: el backend ya rechaza su descarga, pero la vista tampoco la ofrece.
 */
@Component({
  selector: 'app-documentos-lista',
  imports: [FormsModule, RouterLink],
  template: `
    <h1>Gestión Documental</h1>

    @if (esAuditor()) {
      <p class="nota">
        Vista de auditoría: solo metadatos de documentos no sensibles. Nunca se muestra ni se
        descarga el contenido del archivo.
      </p>
    } @else {
      <form class="formulario" (ngSubmit)="filtrar()">
        <label for="fMenor">Id del menor (opcional)</label>
        <input id="fMenor" name="fMenor" [(ngModel)]="filtroMenorId" />
        <label for="fHogar">Id del hogar (opcional)</label>
        <input id="fHogar" name="fHogar" [(ngModel)]="filtroHogarId" />
        <label for="fCategoria">Categoría (opcional)</label>
        <select id="fCategoria" name="fCategoria" [(ngModel)]="filtroCategoria">
          <option value="">Todas</option>
          @for (c of todasCategorias; track c.valor) {
            <option [value]="c.valor">{{ c.etiqueta }}</option>
          }
        </select>
        <label for="fEstado">Estado (opcional)</label>
        <select id="fEstado" name="fEstado" [(ngModel)]="filtroEstado">
          <option value="">Todos</option>
          @for (e of estados; track e.valor) {
            <option [value]="e.valor">{{ e.etiqueta }}</option>
          }
        </select>
        <button type="submit" [disabled]="cargando()">Filtrar</button>
      </form>
    }

    @if (cargando()) {
      <p class="nota">Cargando documentos...</p>
    }
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }

    <ul class="lista-simple">
      @for (d of documentos(); track d.id) {
        <li class="tarjeta">
          <a [routerLink]="['/documentos', d.id]">
            <p><strong>{{ d.titulo }}</strong></p>
            <p>Categoría: {{ etiquetaCategoria(d.categoria) }}</p>
            <p>Estado: {{ etiquetaEstadoFlujo(d.estado_flujo) }} — Versión {{ d.version }}</p>
            <p>Archivo: {{ d.nombre_original }} ({{ formatoTamanio(d.tamanio_bytes) }})</p>
          </a>
        </li>
      }
      @if (!cargando() && documentos().length === 0) {
        <p class="nota">No hay documentos para mostrar con estos filtros.</p>
      }
    </ul>

    @if (!esAuditor() && puedeSubir()) {
      <form class="formulario tarjeta" (ngSubmit)="subir()" #f="ngForm">
        <h2>Subir documento</h2>
        <label for="destino">Este documento es de</label>
        <select id="destino" name="destino" [(ngModel)]="nuevo.destino" (ngModelChange)="nuevo.categoria = ''">
          <option value="menor">Un menor</option>
          <option value="hogar">Un hogar</option>
        </select>

        @if (nuevo.destino === 'menor') {
          <label for="nMenorId">Id del menor</label>
          <input id="nMenorId" name="nMenorId" required [(ngModel)]="nuevo.menor_id" />
        } @else {
          <label for="nHogarId">Id del hogar</label>
          <input id="nHogarId" name="nHogarId" required [(ngModel)]="nuevo.hogar_id" />
        }

        <label for="nCategoria">Categoría</label>
        <select id="nCategoria" name="nCategoria" required [(ngModel)]="nuevo.categoria">
          <option value="" disabled>Seleccione una categoría</option>
          @for (c of (nuevo.destino === 'menor' ? categoriasMenor : categoriasHogar); track c.valor) {
            <option [value]="c.valor">{{ c.etiqueta }}</option>
          }
        </select>

        <label for="nTitulo">Título</label>
        <input id="nTitulo" name="nTitulo" required [(ngModel)]="nuevo.titulo" />

        <label for="nArchivo">Archivo</label>
        <input id="nArchivo" name="nArchivo" type="file" required (change)="seleccionarArchivo($event)" />

        @if (puedeMigrar()) {
          <label>
            <input type="checkbox" name="nMigracion" [(ngModel)]="nuevo.migracion" />
            Es digitalización del historial físico (migración)
          </label>
          @if (nuevo.migracion) {
            <label for="nMotivo">Motivo de la migración</label>
            <input id="nMotivo" name="nMotivo" required [(ngModel)]="nuevo.motivo" />
          }
        }

        <button type="submit" [disabled]="f.invalid || !archivoSeleccionado() || subiendo()">
          {{ subiendo() ? 'Subiendo...' : 'Subir documento' }}
        </button>
      </form>
    }
  `,
})
export class DocumentosLista {
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

  protected readonly etiquetaCategoria = etiquetaCategoria;
  protected readonly etiquetaEstadoFlujo = etiquetaEstadoFlujo;
  protected readonly formatoTamanio = formatoTamanio;
  protected readonly categoriasMenor = CATEGORIAS_MENOR;
  protected readonly categoriasHogar = CATEGORIAS_HOGAR;
  protected readonly todasCategorias = [...CATEGORIAS_MENOR, ...CATEGORIAS_HOGAR.filter((h) => h.valor !== 'otros')];
  protected readonly estados = ESTADOS_FLUJO;

  protected readonly documentos = signal<Documento[]>([]);
  protected readonly cargando = signal(false);
  protected readonly error = signal('');
  protected readonly subiendo = signal(false);
  protected readonly archivoSeleccionado = signal<File | null>(null);

  protected filtroMenorId = '';
  protected filtroHogarId = '';
  protected filtroCategoria = '';
  protected filtroEstado = '';

  protected readonly esAuditor = computed(() => this.auth.rol() === 'auditor');
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
    if (this.filtroMenorId) this.nuevo.menor_id = this.filtroMenorId;
    if (this.filtroHogarId) {
      this.nuevo.hogar_id = this.filtroHogarId;
      this.nuevo.destino = 'hogar';
    }
    void this.cargar();
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
    this.archivoSeleccionado.set(input.files?.[0] ?? null);
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
