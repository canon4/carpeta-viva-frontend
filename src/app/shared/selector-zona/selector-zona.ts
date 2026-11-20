import { HttpClient } from '@angular/common/http';
import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AuthService } from '../../core/auth/auth';
import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Zona = components['schemas']['ZonaOut'];

let contador = 0;

/**
 * Reemplaza "Id de la zona" escrito a mano por una lista con el nombre de cada zona.
 * GET /zonas-hogares/zonas es de coordinador y admin (ADR-0016): el coordinador recibe solo su
 * zona, así que la lista trae una sola opción y queda elegida sola. Para otros roles no se
 * muestra nada (el componente padre decide si tiene sentido filtrar).
 */
@Component({
  selector: 'app-selector-zona',
  imports: [FormsModule],
  template: `
    @if (puedeListar()) {
      <label [for]="campoId">{{ etiqueta }}</label>
      <select
        [id]="campoId"
        [name]="campoId"
        [ngModel]="valor"
        (ngModelChange)="cambiar($event)"
        [required]="requerido"
        [disabled]="cargando()"
      >
        @if (!requerido || zonas().length !== 1) {
          <option value="">{{ cargando() ? 'Cargando...' : opcionVacia }}</option>
        }
        @for (z of zonas(); track z.id) {
          <option [value]="z.id">{{ z.nombre }}</option>
        }
      </select>
    }
  `,
})
export class SelectorZona {
  @Input() valor = '';
  @Input() requerido = false;
  @Input() etiqueta = 'Zona';
  @Input() opcionVacia = 'Todas las zonas';
  @Output() readonly valorChange = new EventEmitter<string>();

  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);
  private readonly auth = inject(AuthService);

  protected readonly campoId = `selector-zona-${++contador}`;
  protected readonly zonas = signal<Zona[]>([]);
  protected readonly cargando = signal(false);

  protected puedeListar(): boolean {
    const rol = this.auth.rol();
    return rol === 'coordinador' || rol === 'admin';
  }

  constructor() {
    if (this.puedeListar()) void this.cargar();
  }

  protected cambiar(valor: string): void {
    this.valor = valor;
    this.valorChange.emit(valor);
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const zonas = await firstValueFrom(this.http.get<Zona[]>(`${this.config.apiUrl}/zonas-hogares/zonas`));
      this.zonas.set([...zonas].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')));
      // Una sola zona posible y campo obligatorio: se elige sola, no hay nada que preguntar.
      if (this.requerido && zonas.length === 1 && !this.valor) this.cambiar(zonas[0].id);
    } catch {
      this.zonas.set([]);
    } finally {
      this.cargando.set(false);
    }
  }
}
