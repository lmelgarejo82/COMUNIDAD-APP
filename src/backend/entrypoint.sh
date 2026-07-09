#!/bin/sh
set -e

echo "Esperando PostgreSQL en db:5432..."
until pg_isready -h db -U postgres -d comunidad; do
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
