# Operación de `demo.tavalink.com.py`

Este stack es exclusivo de la demo. Todos los comandos se ejecutan desde el checkout en `/opt/tavalink-demo`.

## Archivos privados

Crear `.env` desde `.env.example`, reemplazar todos los marcadores por valores aleatorios URL-safe y ejecutar `chmod 600 .env`.

Crear `DEMO-CREDENTIALS.txt` con permisos `600`. El formato permite cargar las contraseñas sin imprimirlas:

```sh
DEMO_ADMIN_PASSWORD='<valor aleatorio>'
DEMO_RESIDENT_PASSWORD='<valor aleatorio>'
DEMO_GUARD_PASSWORD='<valor aleatorio>'
DEMO_ACCESS_PASSWORD='<valor aleatorio>'
```

No copiar estos archivos al repositorio ni pasarlos como argumentos de línea de comandos.

## Stack

```sh
docker compose --env-file .env -p tavalink-demo -f deploy/demo/docker-compose.demo.yml up -d --build
docker compose --env-file .env -p tavalink-demo -f deploy/demo/docker-compose.demo.yml ps
```

PostgreSQL y Redis no publican puertos. El frontend se publica sólo en `127.0.0.1:${DEMO_HTTP_PORT:-18080}` para que Nginx sea la única entrada pública.

## Reset manual seguro

El reset aborta salvo que el contenedor tenga `DEMO_ENV=true` y el nombre de la base incluya `demo`. Borra únicamente comunidades con los access codes reservados de demo y vuelve a crear `Residencial Los Lapachos`.

```sh
sudo docker compose --env-file .env -p tavalink-demo -f deploy/demo/docker-compose.demo.yml \
  cp DEMO-CREDENTIALS.txt backend:/tmp/tavalink-demo-credentials
sudo docker compose --env-file .env -p tavalink-demo -f deploy/demo/docker-compose.demo.yml \
  exec backend sh -c 'set -a; . /tmp/tavalink-demo-credentials; set +a; npm run db:reset-demo; status=$?; rm -f /tmp/tavalink-demo-credentials; exit $status'
```

## Nginx y TLS

Copiar solamente `deploy/demo/nginx-demo.conf` a `/etc/nginx/sites-available/demo.tavalink.com.py`, habilitar ese archivo, y luego:

```sh
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx --redirect -d demo.tavalink.com.py
sudo nginx -t
```

No ampliar el comando Certbot con otros hostnames.

## Reinicio y comprobaciones

```sh
docker compose --env-file .env -p tavalink-demo -f deploy/demo/docker-compose.demo.yml restart
docker compose --env-file .env -p tavalink-demo -f deploy/demo/docker-compose.demo.yml ps
curl -fsS http://127.0.0.1:${DEMO_HTTP_PORT:-18080}/health
curl -fsS http://127.0.0.1:${DEMO_HTTP_PORT:-18080}/api/health
```

Las integraciones externas quedan neutralizadas mediante configuración vacía y SMTP local no escuchado: Mercado Pago, Twilio/WhatsApp, DeepSeek/AI y correo real. La cola interna usa el Redis aislado para conservar el comportamiento del módulo, pero no puede enviar WhatsApp porque esa capacidad falla cerrada.
