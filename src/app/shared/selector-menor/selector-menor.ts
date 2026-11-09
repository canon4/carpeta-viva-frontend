import { HttpClient } from '@angular/common/http';
import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import { AppConfigService } from '../../core/config/app-config';
import type { components } from '../../core/api/schema';

type Menor = components['schemas']['MenorOut'];

let contador = 0;

/**
 * Reemplaza los campos de "Id del menor" escritos a mano por una lista desplegable con nombre y
 * número de documento. Usa GET /menores, que ya devuelve solo los menores que el usuario puede
 * ver — no hay que adivinar ni copiar un id de otra pantalla.
 */
@Component({
  selector: 'app-selector-menor',
  imports: [FormsModule],
  template: `
    <label [for]="campoId">{{ etiqueta }}</label>
    <select
      [id]="campoId"
      [name]="campoId"
      [ngModel]="valor"
      (ngModelChange)="cambiar($event)"
      [required]="requerido"
      [disabled]="cargando()"
    >
      <option value="">{{ cargando() ? 'Cargando...' : opcionVacia }}</option>
      @for (m of menores(); track m.id) {
        <option [value]="m.id">{{ m.nombres }} {{ m.apellidos }}{{ m.numero_documento ? ' — ' + m.numero_documento : '' }}</option>
      }
    </select>
    @if (!cargando() && menores().length === 0) {
      <p class="nota">No tiene menores asignados para elegir.</p>
    }
  `,
})
export class SelectorMenor {
  @Input() valor = '';
  @Input() requerido = false;
  @Input() etiqueta = 'Menor';
  @Input() opcionVacia = 'Seleccione un menor';
  @Output() readonly valorChange = new EventEmitter<string>();

  private readonly http = inject(HttpClient);
  private readonly config = inject(AppConfigService);

  protected readonly campoId = `selectorMenor${++contador}`;
  protected readonly cargando = signal(false);
  protected readonly menores = signal<Menor[]>([]);

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      this.menores.set(await firstValueFrom(this.http.get<Menor[]>(`${this.config.apiUrl}/menores`)));
    } catch {
      // La lista queda vacía; el formulario sigue usable sin filtrar/elegir un menor.
    } finally {
      this.cargando.set(false);
    }
  }

  protected cambiar(valor: string): void {
    this.valor = valor;
    this.valorChange.emit(valor);
  }
}
