# Build en contenedor porque Angular 22 exige Node >=22.22/24 (ADR-0005); el Node de
# desarrollo en Windows de este equipo es insuficiente para el CLI. Se construye aquí y
# nunca se depende de un `dist/` ya compilado en el host. nginx.conf y config.json quedan
# horneados en la imagen (ADR-0012) para que esta app se despliegue sola en Dokploy, sin
# depender de volúmenes externos de Carpeta_Viva; el docker-compose.yml de demo local sigue
# pudiendo pisarlos con `infra/nginx/default.conf` e `infra/frontend/config.json`.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist/frontend/browser /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# config.json se genera al arrancar el contenedor desde API_URL/ACCESOS_RAPIDOS_DESARROLLO
# (ADR-0012); nginx:1.27-alpine corre todo *.sh de /docker-entrypoint.d/ antes de nginx.
COPY docker/30-generar-config.sh /docker-entrypoint.d/30-generar-config.sh
RUN chmod +x /docker-entrypoint.d/30-generar-config.sh
EXPOSE 80
