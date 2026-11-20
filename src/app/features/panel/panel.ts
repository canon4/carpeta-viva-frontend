import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';
import type { Rol } from '../../core/navegacion';

type Alerta = components['schemas']['AlertaOut'];
type Documento = components['schemas']['DocumentoOut'];
type Cita = components['schemas']['app__modules__citas__schemas__CitaOut'];
type Menor = components['schemas']['MenorOut'];
type Alimento = components['schemas']['AlimentoItemOut'];
type Madre = components['schemas']['MadreOut'];

interface Indicador {
  id: string;
  titulo: string;
  valor: number | null;
  ruta: string;
  query?: Record<string, string>;
  urgente?: boolean;
}

interface Tarea {
  id: string;
  tipo: 'alerta' | 'documento' | 'cita';
  titulo: string;
  detalle: string;
  accion: string;
  ruta: string[];
  query?: Record<string, string>;
  urgente: boolean;
}

interface Acceso {
  titulo: string;
  ruta: string;
  query?: Record<string, string>;
  emergencia?: boolean;
}

const TIPO_ALERTA: Record<string, string> = {
  evasion: 'Evasión',
  visita_vencida: 'Visita vencida',
  documento_faltante: 'Documento faltante',
  indexacion_pendiente: 'Indexación pendiente',
};

const TIPO_CITA: Record<string, string> = {
  medica: 'Cita médica',
  psicosocial: 'Cita psicosocial',
  reunion_familia: 'Reunión con familia biológica',
  otro: 'Cita',
};

/** Acciones más frecuentes de cada rol; `nuevo=1` abre el formulario del módulo de una vez. */
const ACCESOS: Record<Rol, Acceso[]> = {
  madre: [
    { titulo: 'Subir documento', ruta: '/documentos', query: { nuevo: '1' } },
    { titulo: 'Registrar compra', ruta: '/alimentos', query: { nuevo: '1' } },
    { titulo: 'Registrar cita', ruta: '/citas', query: { nuevo: '1' } },
    { titulo: 'Reportar evasión', ruta: '/alertas/reportar-evasion', emergencia: true },
  ],
  profesional: [
    { titulo: 'Documentos por revisar', ruta: '/documentos', query: { estado: 'en_revision' } },
    { titulo: 'Mis menores', ruta: '/menores/panel' },
    { titulo: 'Asistente de IA', ruta: '/ia' },
    { titulo: 'Reportar evasión', ruta: '/alertas/reportar-evasion', emergencia: true },
  ],
  defensor: [
    { titulo: 'Documentos por revisar', ruta: '/documentos', query: { estado: 'en_revision' } },
    { titulo: 'Mis menores', ruta: '/menores/panel' },
    { titulo: 'Reunión con familia', ruta: '/citas', query: { nuevo: '1' } },
    { titulo: 'Reportar evasión', ruta: '/alertas/reportar-evasion', emergencia: true },
  ],
  coordinador: [
    { titulo: 'Registrar menor', ruta: '/menores', query: { nuevo: '1' } },
    { titulo: 'Ingreso o traslado', ruta: '/asignaciones', query: { nuevo: '1' } },
    { titulo: 'Hacer pedido', ruta: '/inventario' },
    { titulo: 'Reportes', ruta: '/reportes' },
  ],
  auditor: [
    { titulo: 'Registro de accesos', ruta: '/auditoria' },
    { titulo: 'Documentos', ruta: '/documentos' },
    { titulo: 'Reportes', ruta: '/reportes' },
  ],
  admin: [
    { titulo: 'Zonas y hogares', ruta: '/zonas-hogares' },
    { titulo: 'Configuración', ruta: '/configuracion' },
    { titulo: 'Reportes', ruta: '/reportes' },
    { titulo: 'Auditoría', ruta: '/auditoria' },
  ],
};

const ROL_LEGIBLE: Record<Rol, string> = {
  madre: 'Madre sustituta',
  profesional: 'Profesional',
  defensor: 'Defensor de familia',
  coordinador: 'Coordinador de zona',
  auditor: 'Auditor',
  admin: 'Administrador',
};

/**
 * Panel de inicio por rol: en lugar de repetir el menú, muestra lo que requiere atención
 * (alertas sin ver, documentos por revisar o por corregir, próximas citas, alimentos vencidos)
 * y las acciones más frecuentes del rol. Cada dato sale de la API con los permisos del usuario.
 */
@Component({
  selector: 'app-panel',
  imports: [RouterLink],
  template: `
    <div class="encabezado-panel">
      <h1>{{ saludo }}</h1>
      <p class="nota">{{ rolLegible() }}</p>
    </div>

    <section aria-labelledby="tituloAccesos" class="bloque">
      <h2 id="tituloAccesos" class="oculto">Acciones rápidas</h2>
      <div class="accesos">
        @for (a of accesos(); track a.titulo) {
          <a [routerLink]="a.ruta" [queryParams]="a.query" class="acceso" [class.emergencia]="a.emergencia">{{ a.titulo }}</a>
        }
      </div>
    </section>

    @if (indicadores().length > 0) {
      <section aria-labelledby="tituloResumen" class="bloque">
        <h2 id="tituloResumen" class="oculto">Resumen</h2>
        <div class="indicadores">
          @for (i of indicadores(); track i.id) {
            <a class="indicador" [class.urgente]="i.urgente && !!i.valor" [routerLink]="i.ruta" [queryParams]="i.query">
              <span class="valor">{{ i.valor === null ? '…' : i.valor }}</span>
              <span class="titulo">{{ i.titulo }}</span>
            </a>
          }
        </div>
      </section>
    }

    <section aria-labelledby="tituloAtencion" class="bloque">
      <h2 id="tituloAtencion">Lo que requiere su atención</h2>
      @if (cargando()) {
        <p class="nota" role="status">Revisando pendientes...</p>
      } @else if (tareas().length === 0) {
        <p class="al-dia">Está al día: no hay pendientes.</p>
      } @else {
        <ul class="tareas">
          @for (t of tareas(); track t.id) {
            <li [class.urgente]="t.urgente">
              <div>
                <strong>{{ t.titulo }}</strong>
                <span class="nota">{{ t.detalle }}</span>
              </div>
              <a [routerLink]="t.ruta" [queryParams]="t.query" class="boton-secundario enlace-accion">{{ t.accion }}</a>
            </li>
          }
        </ul>
      }
    </section>
  `,
  styles: [`
    .encabezado-panel { margin-bottom: 1.25rem; }
    .encabezado-panel h1 { margin: 0; }
    .encabezado-panel p { margin: 0.15rem 0 0; }
    .bloque { margin-bottom: 1.75rem; }
    .bloque h2 { font-size: 1.1rem; margin: 0 0 0.75rem; }
    .oculto { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }

    .accesos { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr)); }
    .acceso {
      display: flex; align-items: center; justify-content: center; text-align: center;
      min-height: 64px; padding: 0.75rem 1rem; border-radius: var(--radio);
      background: var(--color-primario); color: #fff; font-weight: 700; text-decoration: none;
    }
    .acceso:hover { background: var(--color-primario-hover); }
    .acceso.emergencia { background: #b00020; }
    .acceso.emergencia:hover { background: #8a0019; }

    .indicadores { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); }
    .indicador {
      display: grid; gap: 0.15rem; padding: 0.9rem 1rem; border-radius: var(--radio);
      background: var(--color-superficie); border: 1px solid var(--color-borde);
      color: inherit; text-decoration: none;
    }
    .indicador:hover { border-color: var(--color-primario); }
    .indicador .valor { font-size: 1.9rem; font-weight: 800; line-height: 1.1; color: var(--color-primario); }
    .indicador .titulo { font-size: 0.95rem; }
    .indicador.urgente { border-color: #b00020; background: #fff5f5; }
    .indicador.urgente .valor { color: #b00020; }

    .tareas { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
    .tareas li {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem;
      padding: 0.75rem 1rem; background: var(--color-superficie);
      border: 1px solid var(--color-borde); border-left: 4px solid var(--color-primario); border-radius: var(--radio);
    }
    .tareas li.urgente { border-left-color: #b00020; }
    .tareas li div { display: grid; gap: 0.1rem; }
    .enlace-accion {
      display: inline-flex; align-items: center; min-height: 44px; padding: 0 1rem;
      border: 1px solid var(--color-primario); border-radius: var(--radio); text-decoration: none; font-weight: 600;
    }
    .al-dia { padding: 1rem; background: var(--color-primario-suave); border-radius: var(--radio); margin: 0; }
  `],
})
export class Panel {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly cargando = signal(true);
  private readonly alertas = signal<Alerta[] | null>(null);
  private readonly documentos = signal<Documento[] | null>(null);
  private readonly citas = signal<Cita[] | null>(null);
  private readonly vencidos = signal<number | null>(null);
  private readonly nombres = signal<Record<string, string>>({});

  protected readonly saludo = (() => {
    const hora = new Date().getHours();
    return hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches';
  })();

  protected readonly rolLegible = computed(() => {
    const rol = this.auth.rol();
    return rol ? ROL_LEGIBLE[rol] : '';
  });

  protected readonly accesos = computed(() => {
    const rol = this.auth.rol();
    return rol ? ACCESOS[rol] : [];
  });

  private readonly esMadre = computed(() => this.auth.rol() === 'madre');
  private readonly revisaDocumentos = computed(() => {
    const rol = this.auth.rol();
    return rol === 'profesional' || rol === 'defensor' || rol === 'coordinador' || rol === 'admin';
  });

  protected readonly indicadores = computed<Indicador[]>(() => {
    const rol = this.auth.rol();
    if (!rol || rol === 'auditor') return [];
    const lista: Indicador[] = [
      { id: 'alertas', titulo: 'Alertas sin ver', valor: this.alertas()?.length ?? null, ruta: '/alertas', urgente: true },
    ];
    if (this.esMadre()) {
      lista.push({ id: 'corregir', titulo: 'Documentos para corregir', valor: this.documentos()?.length ?? null, ruta: '/documentos', query: { estado: 'devuelto' }, urgente: true });
    } else if (this.revisaDocumentos()) {
      lista.push({ id: 'revisar', titulo: 'Documentos por revisar', valor: this.documentos()?.length ?? null, ruta: '/documentos', query: { estado: 'en_revision' } });
    }
    lista.push({ id: 'citas', titulo: 'Citas en 7 días', valor: this.citasSemana()?.length ?? null, ruta: '/citas' });
    if (this.esMadre()) {
      lista.push({ id: 'vencidos', titulo: 'Alimentos vencidos', valor: this.vencidos(), ruta: '/alimentos', query: { vista: 'vencidos' }, urgente: true });
    }
    return lista;
  });

  private readonly citasSemana = computed(() => {
    const citas = this.citas();
    if (!citas) return null;
    const limite = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return citas.filter((c) => new Date(c.fecha_hora).getTime() <= limite);
  });

  /** Pendientes concretos, lo más urgente primero: evasiones, otras alertas, documentos y citas de 48 h. */
  protected readonly tareas = computed<Tarea[]>(() => {
    const tareas: Tarea[] = [];
    for (const a of this.alertas() ?? []) {
      tareas.push({
        id: 'a' + a.id,
        tipo: 'alerta',
        titulo: `${TIPO_ALERTA[a.tipo] ?? a.tipo}: ${this.nombreMenor(a.menor_id)}`,
        detalle: `${a.descripcion} · ${this.haceCuanto(a.created_at)}`,
        accion: 'Ver alerta',
        ruta: ['/alertas'],
        urgente: a.tipo === 'evasion',
      });
    }
    const madre = this.esMadre();
    for (const d of this.documentos() ?? []) {
      tareas.push({
        id: 'd' + d.id,
        tipo: 'documento',
        titulo: madre ? `Corregir: ${d.titulo}` : `Revisar: ${d.titulo}`,
        detalle: madre
          ? `Devuelto${d.motivo_devolucion ? ': ' + d.motivo_devolucion : ''}`
          : `${d.menor_id ? this.nombreMenor(d.menor_id) : 'Documento del hogar'} · enviado ${this.haceCuanto(d.created_at)}`,
        accion: madre ? 'Corregir' : 'Revisar',
        ruta: ['/documentos', d.id],
        urgente: false,
      });
    }
    const limite48 = Date.now() + 48 * 60 * 60 * 1000;
    for (const c of this.citas() ?? []) {
      if (new Date(c.fecha_hora).getTime() > limite48) continue;
      tareas.push({
        id: 'c' + c.id,
        tipo: 'cita',
        titulo: `${TIPO_CITA[c.tipo] ?? 'Cita'}: ${this.nombreMenor(c.menor_id)}`,
        detalle: `${this.fechaLegible(c.fecha_hora)}${c.lugar ? ' · ' + c.lugar : ''}`,
        accion: 'Ver citas',
        ruta: ['/citas'],
        urgente: false,
      });
    }
    const orden = (t: Tarea) => (t.urgente ? 0 : t.tipo === 'alerta' ? 1 : t.tipo === 'documento' ? 2 : 3);
    return tareas.sort((a, b) => orden(a) - orden(b)).slice(0, 8);
  });

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    const rol = this.auth.rol();
    const api = this.config.apiUrl;
    const tareas: Promise<unknown>[] = [
      this.intentar(this.http.get<Alerta[]>(`${api}/alertas/mis-pendientes`), (v) => this.alertas.set(v), () => this.alertas.set([])),
      this.intentar(this.http.get<Cita[]>(`${api}/citas/proximas`), (v) => this.citas.set(v), () => this.citas.set([])),
      this.intentar(this.http.get<Menor[]>(`${api}/menores`), (v) =>
        this.nombres.set(Object.fromEntries(v.map((m) => [m.id, `${m.nombres} ${m.apellidos}`]))),
      ),
    ];
    if (rol === 'madre') {
      tareas.push(
        this.intentar(this.http.get<Documento[]>(`${api}/documentos`, { params: { estado_flujo: 'devuelto' } }), (v) => this.documentos.set(v), () => this.documentos.set([])),
        this.cargarVencidos(),
      );
    } else if (this.revisaDocumentos()) {
      tareas.push(
        this.intentar(this.http.get<Documento[]>(`${api}/documentos`, { params: { estado_flujo: 'en_revision' } }), (v) => this.documentos.set(v), () => this.documentos.set([])),
      );
    }
    await Promise.all(tareas);
    this.cargando.set(false);
  }

  private async cargarVencidos(): Promise<void> {
    try {
      const madre = await firstValueFrom(this.http.get<Madre>(`${this.config.apiUrl}/madres/yo`));
      if (!madre.hogar_id) {
        this.vencidos.set(0);
        return;
      }
      const vencidos = await firstValueFrom(
        this.http.get<Alimento[]>(`${this.config.apiUrl}/alimentos`, { params: { hogar_id: madre.hogar_id, vencidos: 'true' } }),
      );
      this.vencidos.set(vencidos.length);
    } catch {
      this.vencidos.set(0);
    }
  }

  /** Cada consulta falla por su cuenta: un pendiente que no carga no oculta los demás. */
  private async intentar<T>(peticion: import('rxjs').Observable<T>, ok: (v: T) => void, error?: () => void): Promise<void> {
    try {
      ok(await firstValueFrom(peticion));
    } catch {
      error?.();
    }
  }

  private nombreMenor(id: string): string {
    return this.nombres()[id] ?? 'un menor';
  }

  private fechaLegible(iso: string): string {
    const fecha = new Date(iso);
    return fecha.toLocaleString('es-CO', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  }

  private haceCuanto(iso: string): string {
    const minutos = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (minutos < 60) return `hace ${minutos} min`;
    const horas = Math.round(minutos / 60);
    if (horas < 24) return `hace ${horas} h`;
    const dias = Math.round(horas / 24);
    return dias === 1 ? 'hace 1 día' : `hace ${dias} días`;
  }
}
