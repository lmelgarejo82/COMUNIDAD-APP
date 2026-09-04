# QA post code splitting frontend

## Cierre live Bloque 34B

Fecha de ejecucion: 2026-09-04.

Esta seccion completa en Docker real los puntos que habian quedado pendientes en la reejecucion anterior. El antecedente del error de permisos se conserva debajo.

### VALIDADO

Entorno y Docker:

- Estado Git inicial: `main`, HEAD `7291905b43610a30e6e531270a962552386edeeb`, `ahead 3`, worktree limpio.
- `docker version` y `docker info` comunicaron correctamente con Docker Desktop `4.89.0`, engine `29.7.2` y contexto activo `desktop-linux`.
- El usuario Windows no pertenece a `docker-users`, pero el engine WSL2 actual fue accesible sin elevacion ni cambios del host.
- El `permission denied` de la ejecucion anterior no fue reproducible. No se cambio contexto, grupo, servicio ni configuracion del proyecto.
- `docker compose up -d --build` completo correctamente.
- PostgreSQL y Redis quedaron `healthy`; backend y frontend quedaron running en `3000` y `8080`.
- Las 27 migraciones existentes fueron reconocidas y omitidas por ya estar aplicadas.
- Redis conecto correctamente para rate limiting y cache despues del arranque.

Health y rate limiting:

- `GET http://localhost:3000/api/health` respondio `200`, `{"status":"ok"}`.
- Una serie de 30 solicitudes de health devolvio `30/30` respuestas `200`.
- Una rafaga de 25 solicitudes autenticadas a `/api/dashboard/admin` devolvio `25/25` respuestas `200`, sin `401`, `403`, `429` ni `500`.
- Tres vueltas de navegacion admin mantuvieron cantidades estables de requests: 4 por dashboard, tickets, accesos y documentos; 5 por estructura y amenities. No hubo crecimiento entre rondas.

Admin live:

- Login real exitoso como `admin1@comunidad.app`.
- `/dashboard` -> Dashboard visible, APIs `200`, sin fallback ni pantalla blanca.
- `/expensas` -> Expensas visible, chunk independiente cargado, sin errores.
- `/anuncios` -> Anuncios visible, chunk independiente cargado, sin errores.
- `/tickets` -> Tickets visible, chunk independiente cargado, sin errores.
- `/accesos` -> Accesos visible, chunks de AccessLogs y hierarchy cargados, sin errores.
- `/invite` -> Invitar residente visible, chunk independiente cargado, sin errores.
- `/estructura` -> Estructura visible, chunk independiente cargado, sin errores.
- `/audit` -> Historial visible, chunk independiente cargado, sin errores.
- `/amenities` -> Reservas de Amenities visible, chunk independiente cargado, sin errores.
- `/documents` -> Documentacion Legal visible, chunk independiente cargado, sin errores.
- `/admin/estructura` y `/unidades` redirigieron a `/estructura` con contenido visible.
- Hard refresh autenticado exitoso en `/tickets`, `/accesos`, `/estructura`, `/amenities` y `/documents`; la sesion se conservo y cada chunk volvio a resolver sin 404.
- Se completaron tres rondas `dashboard -> tickets -> accesos -> estructura -> amenities -> documents -> dashboard` sin 429, perdida de sesion, fallback colgado, pantalla blanca ni crecimiento de requests.

Residente live:

- Login real exitoso como `vecino11@comunidad.app`.
- `/dashboard`, `/expensas`, `/anuncios`, `/tickets`, `/amenities` y `/documents` cargaron contenido y sus chunks sin errores.
- Refresh autenticado de `/tickets` con sesion conservada.
- `/estructura`, `/accesos`, `/audit` e `/invite` redirigieron a `/dashboard`.
- Backend real respondio `403` para `/api/access-logs`, `/api/hierarchy/admin/complexes`, `/api/admin/audit` y `POST /api/admin/invite`.
- Logout y posterior intento de abrir `/tickets` terminaron en `/login`.

Guardia live:

- Login real exitoso como `guardia1@comunidad.app`, rol `access_operator`.
- `/accesos` cargo contenido y `GET /api/access-logs` respondio `200`.
- Refresh autenticado de `/accesos` con sesion conservada.
- `/tickets` redirigio a `/accesos`.
- `GET /api/tickets` respondio `403` en backend real.
- Logout y posterior intento de abrir `/accesos` terminaron en `/login`.

Lazy chunks y QR:

- Network mostro el entry inicial y chunks separados para las nueve rutas lazy; no reaparecio un bundle monolitico.
- No hubo `Failed to fetch dynamically imported module`, `ChunkLoadError` ni requests de chunks fallidas.
- Una navegacion SPA real `dashboard -> tickets` mediante el enlace del menu tambien termino correctamente en `/tickets`.
- Se creo la preautorizacion temporal `QA QR lazy 20260904`, se genero su invitacion y el POST respondio `201`.
- El chunk QR `browser-C80QGymg.js` respondio `200` y se renderizo una imagen `data:image/png;base64` visible.
- La invitacion QA fue revocada y la preautorizacion cancelada al finalizar, ambas con respuesta `200`; no quedo un acceso QA activo.

Correccion de regresion encontrada:

- Sintoma: guardia recibia `403` en `/api/admin/phone` y `/api/notifications/count`; notifications repetia el request cada 30 segundos.
- Causa raiz: `Layout` montaba notificaciones, `WhatsAppButton` y soporte flotante para `access_operator`, aunque esos endpoints admiten solo admin/residente.
- Impacto: ruido de Network y polling fallido recurrente, sin escalacion de permisos ni bloqueo de Accesos.
- Cambio minimo: `Layout.jsx` no inicia polling, no muestra campana y no monta soporte flotante para `access_operator`. No se cambiaron permisos backend ni rate limits.
- Regresion live: durante mas de 30 segundos en `/accesos`, guardia realizo solo login y access logs, ambos `200`; no hubo phone, notifications, `403`, `429`, fallos ni widget de soporte.
- Sanity admin: phone y notifications conservaron respuestas `200` y el soporte siguio visible.

Tests y build posteriores al cambio:

- `npm test`: `99` tests, `99` passed, `0` failed, `0` skipped; duracion Node `1935.3869 ms`.
- `npm run build`: exitoso, `614` modulos, `3.65 s`.
- Entry final: `index-gzu90JZi.js`, `323.34 kB`, gzip `104.75 kB`.
- Mayor chunk: `Amenities-C4FHB88t.js`, `253.73 kB`, gzip `80.19 kB`.
- QR final: `browser-Bju_xTfx.js`, `25.78 kB`, gzip `10.13 kB`.
- Sin warning Vite por chunk mayor a `500 kB`.
- Docker fue reconstruido despues del cambio y los cuatro servicios continuaron operativos.

### NO VALIDADO

- Lectura fisica de QR con camara/`BarcodeDetector`, explicitamente fuera del alcance de este bloque.
- No quedan validaciones live obligatorias pendientes para el cierre post-code-splitting.

### OBSERVACIONES

- En pestañas de automatizacion reutilizadas intensivamente, el controlador de navegador dejo de activar algunos clicks semanticos. Los mismos botones funcionaron en pestañas limpias; las rutas se verificaron ademas por URL directa, refresh y una navegacion SPA por teclado.
- El build Docker informo paquetes npm deprecados y vulnerabilidades de auditoria ya existentes: frontend `5 high`; backend `6 moderate` y `2 high`. No se ejecuto `npm audit fix` porque dependencias y upgrades estan fuera de alcance.
- Los `401` posteriores a logout y los `403` de pruebas negativas de permisos fueron esperados. No se observaron otros errores de consola o Network.
- Decision: `GO`. El QA live post-code-splitting queda cerrado; la regresion de requests globales del guardia fue corregida y revalidada.

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
