#!/bin/sh
set -e

node -e "require('./config/security').validateSecurityConfig()"

echo "Esperando PostgreSQL en ${PGHOST:-db}:${PGPORT:-5432}..."
until pg_isready -h "${PGHOST:-db}" -p "${PGPORT:-5432}" -U "${PGUSER:-postgres}" -d "${PGDATABASE:-comunidad}"; do
  sleep 2
done

echo "Ejecutando migraciones..."
npm run db:migrate

if [ "$SEED_DB" = "true" ]; then
  echo "Ejecutando seed..."
  node seed.js
fi

echo "Iniciando servidor..."
exec node server.js
