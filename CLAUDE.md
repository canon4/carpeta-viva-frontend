# Frontend (Angular)

Repositorio independiente dentro de Carpeta_Viva. La fuente de verdad es `../CLAUDE.md`: contexto, módulos (`../docs/modulos.md`), decisiones (`../docs/adr/`) y plan (`../docs/plan-por-fases.md`).

- Se compila a archivos estáticos (`dist/frontend/browser`) servidos por Nginx; se despliega sin tocar el backend.
- Un módulo por ruta con carga diferida: `src/app/modules/<modulo>/`. La visibilidad por rol está en `src/app/core/navegacion.ts` (provisional).
- La dirección de la API se lee en tiempo de ejecución de `public/config.json`.
- Los tipos del API se generan desde el contrato del backend: `npm run api:types` (lee `../backend/openapi.json`). No escribir tipos del API a mano.
- El token JWT vive solo en memoria; el esquema definitivo lo define el agente `seguridad`.
- Móvil primero, textos claros, WCAG 2.1 AA, sin emojis. Solo datos sintéticos.
- Comandos: `npm install`, `npm start` (proxy a `localhost:8000`), `npm run build`, `npm test`.
- Agente responsable: `frontend`, junto con `ux-ui`.
