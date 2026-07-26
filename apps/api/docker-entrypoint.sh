#!/bin/sh
set -e

# Les migrations tournent au démarrage du conteneur : un `docker compose up`
# sur une base vierge doit suffire à obtenir une API fonctionnelle.
echo "[entrypoint] Applying database migrations…"
npx prisma migrate deploy

exec "$@"
