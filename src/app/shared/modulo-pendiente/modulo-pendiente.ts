import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-modulo-pendiente',
  template: `
    <section class="tarjeta">
      <h1>{{ datos['titulo'] }}</h1>
      <p>{{ datos['descripcion'] }}</p>
      <p class="nota">Módulo planeado para la fase {{ datos['fase'] }}. Aún no está implementado.</p>
    </section>
  `,
})
export class ModuloPendiente {
  protected readonly datos = inject(ActivatedRoute).snapshot.data;
}
