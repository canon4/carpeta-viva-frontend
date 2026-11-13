#!/bin/sh
# Genera config.json en tiempo de arranque del contenedor a partir de variables de entorno
# (ADR-0012): así la misma imagen sirve para local, demo y producción sin reconstruirla.
# La imagen nginx:1.27-alpine ejecuta todo *.sh de /docker-entrypoint.d/ antes de arrancar.
set -eu

API_URL="${API_URL:-/api/v1}"
ACCESOS_RAPIDOS_DESARROLLO="${ACCESOS_RAPIDOS_DESARROLLO:-false}"

cat > /usr/share/nginx/html/config.json <<EOF
{
  "apiUrl": "${API_URL}",
  "accesosRapidosDesarrollo": ${ACCESOS_RAPIDOS_DESARROLLO}
}
EOF
