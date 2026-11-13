import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { AuthService } from '../../core/auth/auth';
import { MODULOS } from '../../core/navegacion';

@Component({
  selector: 'app-panel',
  imports: [RouterLink],
  template: `
    <div class="panel-container">
      <!-- Banner superior moderno -->
      <section class="welcome-banner">
        <div class="welcome-text">
          <h1>Panel de Control</h1>
          <p>Bienvenido al sistema. Su rol actual es <span class="rol-badge">{{ auth.rol() }}</span></p>
        </div>
        <div class="welcome-icon-box">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect width="7" height="9" x="3" y="3" rx="1"/>
            <rect width="7" height="5" x="14" y="3" rx="1"/>
            <rect width="7" height="9" x="14" y="12" rx="1"/>
            <rect width="7" height="5" x="3" y="16" rx="1"/>
          </svg>
        </div>
      </section>

      <!-- Rejilla de tarjetas con colores e iconos únicos para cada módulo -->
      <div class="rejilla">
        @for (m of visibles(); track m.ruta) {
          @let cfg = obtenerConfig(m.ruta);
          <a class="tarjeta-modulo" [routerLink]="'/' + m.ruta" [style.background]="cfg.fondo" [style.border-color]="cfg.borde">
            <div class="tarjeta-header">
              <!-- Caja de icono con color vibrante único y sombra flotante -->
              <div class="icono-wrapper" [style.background-color]="cfg.color" [style.box-shadow]="'0 8px 20px -4px ' + cfg.color + '88'">
                @if (m.ruta.includes('zona')) {
                  <!-- 1. Zonas y Hogares (Casa) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                } @else if (m.ruta.includes('madre')) {
                  <!-- 2. Madres Sustitutas (Escudo) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                } @else if (m.ruta.includes('profesional')) {
                  <!-- 3. Profesionales (Usuarios) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                } @else if (m.ruta.includes('menor')) {
                  <!-- 4. Menores y Expedientes (Archivo) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                } @else if (m.ruta.includes('asignacion')) {
                  <!-- 5. Asignaciones y Traslados (Enlace) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                } @else if (m.ruta.includes('documental')) {
                  <!-- 6. Gestión Documental (Carpeta) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                } @else if (m.ruta.includes('inventario')) {
                  <!-- 7. Inventario del Hogar (Caja) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>
                } @else if (m.ruta.includes('alimento')) {
                  <!-- 8. Control de Alimentos (Utensilios) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>
                } @else if (m.ruta.includes('cita')) {
                  <!-- 9. Citas y Recordatorios (Calendario) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                } @else if (m.ruta.includes('alerta')) {
                  <!-- 10. Alertas y Evasiones (Campana) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                } @else if (m.ruta.includes('reporte')) {
                  <!-- 11. Reportes (Gráfico) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>
                } @else if (m.ruta.includes('asistente') || m.ruta.includes('ia')) {
                  <!-- 12. Asistente de IA (Estrellas / IA) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                } @else if (m.ruta.includes('archivo') || m.ruta.includes('cierre')) {
                  <!-- 13. Archivo y Cierre (Caja de archivo) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                } @else {
                  <!-- 14. Auditoría (Lupa / Verificación) -->
                  <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                }
              </div>
              <span class="flecha-indicador" [style.color]="cfg.color">→</span>
            </div>
            <div class="tarjeta-body">
              <h2>{{ m.titulo }}</h2>
              <p>{{ m.descripcion }}</p>
            </div>
          </a>
        }
      </div>
    </div>
  `,
  styles: [`
    :host {
      --texto-principal: #344B49;
    }

    .panel-container {
      display: flex;
      flex-direction: column;
      gap: 1.75rem;
      max-width: 1300px;
      margin: 0 auto;
    }

    .welcome-banner {
      background: linear-gradient(135deg, #00A88F 0%, #007A66 100%);
      border-radius: 18px;
      padding: 2.2rem 2.5rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
      box-shadow: 0 10px 25px -5px rgb(0 168 143 / 0.25);
      color: #ffffff;
    }

    .welcome-text h1 {
      font-size: 2rem;
      font-weight: 800;
      margin: 0 0 0.35rem 0;
      letter-spacing: -0.02em;
    }

    .welcome-text p {
      font-size: 1.05rem;
      opacity: 0.9;
      margin: 0;
    }

    .rol-badge {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(4px);
      color: #ffffff;
      padding: 0.2rem 0.75rem;
      border-radius: 8px;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 0.85rem;
      letter-spacing: 0.05em;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .welcome-icon-box {
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(6px);
      color: #ffffff;
      width: 54px;
      height: 54px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.25);
    }

    .rejilla {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
      gap: 1.25rem;
    }

    .tarjeta-modulo {
      border: 1.5px solid;
      border-radius: 18px;
      padding: 1.75rem;
      text-decoration: none;
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      transition: all 0.25s ease;
      box-shadow: 0 6px 15px rgb(0 0 0 / 0.02);
    }

    .tarjeta-modulo:hover {
      transform: translateY(-4px);
      box-shadow: 0 12px 25px -5px rgb(0 0 0 / 0.08);
      filter: brightness(0.98);
    }

    .tarjeta-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .icono-wrapper {
      width: 46px;
      height: 46px;
      border-radius: 14px;
      display: grid;
      place-items: center;
      transition: transform 0.25s ease;
    }

    .tarjeta-modulo:hover .icono-wrapper {
      transform: scale(1.08);
    }

    .flecha-indicador {
      font-weight: 700;
      font-size: 1.2rem;
      transition: transform 0.25s ease;
    }

    .tarjeta-modulo:hover .flecha-indicador {
      transform: translateX(5px);
    }

    .tarjeta-body h2 {
      color: var(--texto-principal);
      font-size: 1.2rem;
      font-weight: 700;
      margin: 0 0 0.4rem 0;
      letter-spacing: -0.01em;
    }

    .tarjeta-body p {
      color: var(--texto-principal);
      opacity: 0.75;
      font-size: 0.92rem;
      line-height: 1.5;
      margin: 0;
    }
  `]
})
export class Panel {
  protected readonly auth = inject(AuthService);
  protected readonly visibles = computed(() => {
    const rol = this.auth.rol();
    return MODULOS.filter((m) => rol !== null && m.roles.includes(rol));
  });

  protected obtenerConfig(ruta: string) {
    if (ruta.includes('zona')) return { color: '#E02424', fondo: '#FDF2F2', borde: '#FECACA' };       // 1. Rojo (Zonas)
    if (ruta.includes('madre')) return { color: '#0066FF', fondo: '#EFF6FF', borde: '#BFDBFE' };      // 2. Azul (Madres)
    if (ruta.includes('profesional')) return { color: '#10B981', fondo: '#ECFDF5', borde: '#A7F3D0' }; // 3. Verde (Profesionales)
    if (ruta.includes('menor')) return { color: '#8B5CF6', fondo: '#F5F3FF', borde: '#DDD6FE' };      // 4. Morado (Menores)
    if (ruta.includes('asignacion')) return { color: '#F59E0B', fondo: '#FFFBEB', borde: '#FDE68A' };  // 5. Amarillo (Asignaciones)
    if (ruta.includes('documental')) return { color: '#EC4899', fondo: '#FDF2F8', borde: '#FBCFE8' };  // 6. Fucsia (Documental)
    if (ruta.includes('inventario')) return { color: '#06B6D4', fondo: '#ECFEFF', borde: '#A5F3FC' };  // 7. Cian (Inventario)
    if (ruta.includes('alimento')) return { color: '#F97316', fondo: '#FFF7ED', borde: '#FED7AA' };    // 8. Naranja (Alimentos)
    if (ruta.includes('cita')) return { color: '#6366F1', fondo: '#EEF2FF', borde: '#C7D2FE' };        // 9. Índigo (Citas)
    if (ruta.includes('alerta')) return { color: '#DC2626', fondo: '#FEF2F2', borde: '#FCA5A5' };      // 10. Rojo oscuro (Alertas)
    if (ruta.includes('reporte')) return { color: '#059669', fondo: '#ECFDF5', borde: '#A7F3D0' };     // 11. Verde esmeralda (Reportes)
    if (ruta.includes('asistente') || ruta.includes('ia')) return { color: '#7C3AED', fondo: '#F5F3FF', borde: '#DDD6FE' }; // 12. Morado IA (Asistente)
    if (ruta.includes('archivo') || ruta.includes('cierre')) return { color: '#4B5563', fondo: '#F3F4F6', borde: '#D1D5DB' }; // 13. Gris plomo (Archivo)
    return { color: '#2563EB', fondo: '#EFF6FF', borde: '#BFDBFE' };                                 // 14. Azul rey (Auditoría)
  }
}