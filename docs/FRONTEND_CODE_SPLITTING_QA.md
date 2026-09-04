# QA post code splitting frontend

## Reejecucion Bloque 34 posterior al ajuste de rate limiting

Fecha de ejecucion: 2026-09-04.

Esta seccion registra la reejecucion posterior a `c91316d fix: tune rate limiting for authenticated app` y prevalece como estado de cierre sobre el QA inicial conservado mas abajo como antecedente historico.

### VALIDADO

Estado Git inicial:

- Rama: `main`.
- HEAD: `c91316d7a07cd1b10252a26c4354452b2c61b3f1`.
- Tracking: `main...origin/main [ahead 2]`.
- Worktree inicial: limpio.
- Origin: `https://github.com/lmelgarejo82/COMUNIDAD-APP.git`.

Diagnostico de code splitting:

- Son lazy las rutas `/expensas`, `/anuncios`, `/tickets`, `/invite`, `/audit`, `/amenities`, `/documents`, `/estructura` y `/accesos`.
- `ChatWidget` se carga con `React.lazy` y `Suspense` con fallback nulo.
- Las rutas lazy usan el fallback visible `Cargando modulo...`.
- `qrcode` continua importandose dinamicamente solo cuando existe `generated.invitation_url`.
- No existen otros `import()` en `src/frontend/src`.
- El layout completo esta envuelto por `ProtectedRoute` y cada ruta conserva su filtro de roles.
- `/admin/estructura` y `/unidades` conservan la redireccion a `/estructura`.

Diagnostico de rate limiting:

- `/api/health` se registra antes de `app.use('/api', globalLimiter)` y queda fuera del limiter global.
- Ventana, limite global y limite auth son configurables mediante `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX` y `AUTH_RATE_LIMIT_MAX`.
- Defaults en produccion sin variables: 15 minutos, global `300`, auth `5`.
- Defaults en desarrollo y Docker: 15 minutos, global `1000`, auth `20`.
- `authLimiter` esta separado y se aplica a registro, login y recuperacion de password.
- `authLimiter` usa `skipSuccessfulRequests: true`.
- La respuesta `429` incluye `message`, `error`, `retryAfter` y header `Retry-After`.
- En `NODE_ENV=test` no se crea cliente Redis; los tests usan memoria y no dependen de Redis externo.

Tests backend:

- Comando: `npm test` desde `src/backend`.
- Resultado: `99` tests, `99` passed, `0` failed, `0` skipped, `0` cancelled.
- Duracion informada por Node: `1392.896 ms`.
- Warnings relevantes: ninguno. Los mensajes de cola deshabilitada son informativos y esperados en tests.

Build frontend:

- Comando: `npm run build` desde `src/frontend`.
- Resultado: exitoso, `614` modulos transformados, build Vite en `3.50 s`.
- Entry: `index-DQW8m1Bg.js`, `323.30 kB`, gzip `104.74 kB`.
- Mayor chunk de ruta: `Amenities-C6p1URnn.js`, `253.73 kB`, gzip `80.19 kB`.
- No aparecio warning de Vite por chunks mayores a `500 kB`.
- Se generaron chunks independientes para las nueve rutas lazy, `ChatWidget` y el modulo `browser` asociado a QR.

Validacion aislada del artefacto frontend:

- Se sirvio temporalmente `dist` con `vite preview` en `http://127.0.0.1:4173` porque Docker no estaba accesible.
- `/login` renderizo el formulario completo en Chrome sin errores ni warnings de consola.
- Cargas directas de `/dashboard`, `/expensas`, `/anuncios`, `/tickets`, `/accesos`, `/invite`, `/estructura`, `/audit`, `/amenities`, `/documents`, `/admin/estructura` y `/unidades` respondieron HTTP `200` desde el servidor SPA.
- Sin sesion, todas esas rutas terminaron correctamente en `/login` con contenido visible y sin pantalla blanca.
- `git diff --check` no informo errores antes de editar este documento.

### NO VALIDADO

- `docker compose up -d --build` y `docker compose ps`: el cliente Docker recibio `permission denied` al abrir tanto `npipe:////./pipe/dockerDesktopLinuxEngine` como `npipe:////./pipe/docker_engine`.
- Estado live de `db`, `redis`, `backend` y `frontend`: no verificable en esta ejecucion.
- `GET http://localhost:3000/api/health`: sin servicio escuchando; no se pudo comprobar el `200` live ni repetirlo contra Docker.
- `http://localhost:8080/login`: `ERR_CONNECTION_REFUSED` en Chrome y sin servicio escuchando desde host.
- Login real, navegacion autenticada, refresh directo autenticado, logout y sesion para admin, residente y guardia.
- Consola y Network durante rutas lazy autenticadas.
- Carga bajo demanda de cada chunk al ingresar por primera vez y regreso a una ruta ya cacheada.
- Flujo real de generacion/render de QR posterior al code splitting.
- Rafaga aproximada de 25 requests autenticadas al dashboard bajo el perfil Docker.
- Permisos live por backend para las capacidades administrativas de residente y Tickets de guardia. La cobertura automatizada de backend si paso, pero no sustituye la verificacion live solicitada.

### OBSERVACIONES

- No se detectaron regresiones en inspeccion de codigo, tests backend, build ni proteccion sin sesion del artefacto frontend.
- La correccion del falso `429` tiene cobertura automatizada y configuracion coherente, pero su resultado live bajo navegacion normal queda pendiente por la indisponibilidad del daemon Docker.
- El fallo Docker ocurre antes de construir o iniciar servicios y no aporta evidencia de una falla del repositorio.
- `Amenities` sigue siendo el chunk lazy mas grande; su tamano permanece dentro del baseline esperado y no justifica otra optimizacion en este bloque.
- Recomendacion de esta reejecucion: `NO-GO` para declarar el cierre QA definitivo hasta repetir Docker, health y los recorridos autenticados. No se encontro un bug funcional que requiera correccion de codigo.

## Ejecucion inicial previa al fix (historico)

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
