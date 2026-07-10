# QA post code splitting frontend

## Estado inicial git

- Rama: `main`
- HEAD inicial: `ecc44386c60bf88651fd0e20a72263fb15443c6a`
- Commit: `ecc4438 chore: split frontend bundles by route`
- Estado inicial: `main...origin/main`, worktree limpio.
- Remote: `origin https://github.com/lmelgarejo82/COMUNIDAD-APP.git`

## Entorno usado

- Docker Compose local.
- Frontend Docker: `http://localhost:8080`
- Backend Docker: `http://localhost:3000`
- Navegador headless: `C:\Program Files\Google\Chrome\Application\chrome.exe`
- Usuarios seed:
  - Admin: `admin1@comunidad.app`
  - Guardia: `guardia1@comunidad.app`
  - Residente: `vecino11@comunidad.app`

## Estado Docker

`docker compose up -d --build` completo correctamente.

Servicios:

- `backend`: arriba.
- `frontend`: arriba.
- `db`: arriba, `healthy`.
- `redis`: arriba, `healthy`.

Health:

- `GET /api/health`: `200`, `{"status":"ok"}`.
- En una validacion posterior desde host, despues de muchas navegaciones/logins automatizados, `/api/health` respondio `429` por rate limiter. Se verifico salud desde dentro del contenedor backend con `200`, `{"status":"ok"}`.

## Build frontend post-splitting

`npm run build` en `src/frontend`: OK.

Resultado principal:

- `index-DMUG4C5I.js`: `323.00 kB`, gzip `104.64 kB`.
- No aparecio el warning de Vite por chunk principal mayor a `500 kB`.

Chunks lazy relevantes:

- `Tickets-BQ9W4RTR.js`: `29.14 kB`, gzip `7.96 kB`.
- `AccessLogs-BtCXvrTh.js`: `59.94 kB`, gzip `13.70 kB`.
- `HierarchyEditor-Bz6YQ7nx.js`: `83.72 kB`, gzip `23.73 kB`.
- `Amenities-BnqysHKq.js`: `253.73 kB`, gzip `80.20 kB`.
- `browser-BPrkVOeF.js`: `25.78 kB`, gzip `10.13 kB`, asociado a carga diferida de QR.

## Backend tests

`npm test` en `src/backend`: OK.

- Total: 96 tests.
- Resultado: 96 pass, 0 fail.

## Rutas revisadas por HTTP

Todas respondieron `200` desde el frontend Docker:

- `/login`
- `/dashboard`
- `/tickets`
- `/accesos`
- `/estructura`
- `/admin/estructura`
- `/unidades`
- `/expensas`
- `/anuncios`
- `/amenities`
- `/documents`
- `/audit`
- `/invite`

Estas respuestas confirman que Nginx sirve correctamente la SPA y que las rutas directas no terminan en 404.

## QA headless de rutas lazy

Se navego con Chrome headless autenticado usando tokens reales del backend.

Resultado admin:

- `/dashboard`: carga OK.
- `/tickets`: carga OK.
- `/accesos`: carga OK.
- `/estructura`: carga OK.
- `/admin/estructura`: redirige a `/estructura`, carga OK.
- `/unidades`: redirige a `/estructura`, carga OK.
- `/expensas`: carga OK.
- `/anuncios`: carga OK.
- `/amenities`: carga OK.
- `/documents`: carga OK.
- `/audit`: carga OK.
- `/invite`: carga OK.

Resultado residente:

- `/tickets`: carga OK.
- `/accesos`: redireccion segura a `/dashboard`, sin pantalla blanca.

Resultado guardia:

- `/accesos`: carga OK.
- `/tickets`: redireccion segura a `/accesos`, sin pantalla blanca.

En todas las navegaciones:

- No quedo visible el fallback `Cargando modulo...`.
- No hubo pantalla blanca.
- No hubo errores de consola relacionados con `ChunkLoadError`.
- No hubo errores de consola relacionados con `Failed to fetch dynamically imported module`.
- No hubo excepciones `TypeError` o `ReferenceError` asociadas al lazy loading.

## QA de roles por API

Checks live contra Docker:

- Admin:
  - `/api/tickets`: `200`.
  - `/api/access-logs`: `200`.
  - `/api/hierarchy/tree`: `200`.
- Guardia:
  - `/api/access-logs`: `200`.
  - `/api/tickets`: `403`, esperado.
- Residente:
  - `/api/access-logs`: `403`, esperado.
  - `/api/tickets` directo: `403`, esperado porque el listado residente usa endpoint propio.

Observacion: al repetir logins y requests automatizados durante el QA, el rate limiter devolvio `429` para verificaciones posteriores desde el host. Esto no se considera regresion de code splitting; es comportamiento esperado ante muchos intentos seguidos. La salud del backend fue confirmada desde el contenedor con respuesta `200`.

## Modulos criticos

Tickets:

- Ruta lazy `/tickets` carga para admin.
- Ruta lazy `/tickets` carga para residente.
- Guardia queda bloqueado/redirigido de forma segura.
- No se detectaron errores de chunk dinamico.

Accesos:

- Ruta lazy `/accesos` carga para admin.
- Ruta lazy `/accesos` carga para guardia.
- Residente queda bloqueado/redirigido de forma segura.
- No se detectaron errores de chunk dinamico.

Estructura:

- `/estructura` carga para admin.
- `/admin/estructura` redirige a `/estructura`.
- `/unidades` redirige a `/estructura`.
- No se detectaron errores de chunk dinamico.

Invitaciones/QR:

- El build separa la libreria QR en chunk diferido.
- No se detectaron errores por la carga diferida del modulo de Accesos.
- No se ejecuto un flujo manual completo de generacion de invitacion en navegador durante este QA rapido.

## Bugs encontrados

No se encontraron bugs atribuibles al code splitting.

## Correcciones aplicadas

No se aplicaron correcciones funcionales ni visuales.

## Observaciones pendientes

- `Amenities` queda como chunk lazy mas grande (`253.73 kB`), aceptable por ahora porque ya no afecta el bundle inicial.
- El flujo completo de generacion de invitacion y render QR queda recomendado para QA manual cuando se pruebe el modulo de Accesos con datos operativos.
- El rate limiter puede activarse durante QA automatizado si se hacen muchos logins seguidos con usuarios seed.

## Decision final

GO con observaciones.

El code splitting queda validado para rutas principales, roles y layout. No se observaron pantallas blancas, fallas de import dinamico ni regresiones de permisos.
