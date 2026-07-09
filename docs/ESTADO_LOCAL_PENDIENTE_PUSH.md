# Estado local pendiente de push

Fecha de inventario: 2026-07-09

## Estado Git actual

- Repo local: `C:\dev\comunidad-app`
- Rama: `main`
- HEAD al crear este inventario: `f92aebd120560666cf9f4a45f23f848c2638f7d1`
- Commit HEAD: `f92aebd docs: add access invitations manual qa`
- Worktree: limpio antes de crear este documento
- Remote origin:
  - fetch: `https://github.com/lmelgarejo82/COMUNIDAD-APP.git`
  - push: `https://github.com/lmelgarejo82/COMUNIDAD-APP.git`

## Motivo por el que no se hizo push

No se hizo push porque el push anterior fallo por permisos:

```text
Permission to lmelgarejo82/COMUNIDAD-APP.git denied to luismelgarejo82
```

No se modificaron credenciales, no se cambio el remote y no se ejecuto push en este bloque.

## Resumen de modulos implementados

- Seguridad multi-comunidad y multi-complejo con contexto validado:
  - `req.communityId`
  - `req.complexId`
  - `req.scope`
- Pagos y MercadoPago:
  - conciliacion segura
  - `external_reference` opaca
  - webhook idempotente
  - bloqueo de pagos ajenos
- Tests de regresion backend para seguridad, pagos y contexto.
- Redis/Bull opcional por env:
  - backend levanta sin Redis cuando colas estan deshabilitadas
  - Docker incluye Redis para colas habilitadas
- Migraciones con historial:
  - `schema_migrations`
  - checksum
  - runner ordenado e idempotente
- Estructura unificada:
  - `/estructura` como pantalla principal
  - rutas legacy redirigidas
- Modelo superior `organizations`:
  - organizacion como agrupador
  - `community` sigue siendo frontera de seguridad
- Selector de alcance multi-complejo:
  - organizacion/comunidad/complejo
  - display compacto sin repeticion redundante
- Modulo Accesos / Bitacora de visitantes:
  - ingresos
  - salidas idempotentes
  - detalle
  - observaciones
  - estado demorado calculado
  - autocomplete real de unidades
- Rol Guardia / `access_operator`:
  - limitado a Accesos y endpoints auxiliares
  - bloqueado en estructura, expensas, pagos, documentos y administracion
- Preautorizaciones:
  - crear/listar/filtrar/cancelar
  - usar preautorizacion de forma idempotente
- Invitaciones digitales:
  - token opaco
  - hash en DB
  - QR visual
  - copiar enlace/codigo/mensaje
  - no guardar token plano
  - validacion server-side
  - ingreso desde invitacion validada
  - escaneo QR opcional con fallback manual
- QA manual/documental del modulo Accesos e invitaciones.

## Lista de commits pendientes de publicacion

Rango local principal pendiente de publicar:

```text
665cbe8 fix: enforce secure community request context
951c7de fix: reconcile MercadoPago payments safely
7d48f2a test: add security regression coverage
b53fccf fix: make ticket queue optional
313c8c3 chore: add migration history runner
21b5841 feat: unify structure management experience
10e4d92 chore: polish unified structure experience
9b709a1 feat: improve multi-complex scope selector
6ffad51 feat: add organization scope model
c349a95 chore: simplify scope selector display
c265498 feat: add visitor access log
c0fecf8 feat: add unit autocomplete for access logs
49e6aaa chore: polish unit search keyboard ux
eb0fb61 feat: add access guard role
96b857b fix: harden access operator permissions
aa86f90 feat: add visitor preauthorizations
8c3639f chore: improve visitor preauthorization admin ux
89d8001 refactor: split visitor preauthorization UI
6990ece docs: design qr visitor invitations
a4d038e feat: add visitor digital invitations
2bd2e98 feat: validate visitor invitations
823801d chore: polish invitation validation ux
cb033bd docs: close access module technical scope
2d01c8a feat: add optional qr scanner for invitations
a7e76ee chore: improve manual invitation sharing
f92aebd docs: add access invitations manual qa
```

Este documento agrega un commit posterior de inventario:

```text
docs: record local state before initial push
```

## Validaciones ejecutadas

### Backend

Comando:

```text
npm test
```

Directorio:

```text
src/backend
```

Resultado:

```text
89 tests
89 pass
0 fail
```

### Frontend

Comando:

```text
npm run build
```

Directorio:

```text
src/frontend
```

Resultado:

```text
Build OK
613 modules transformed
```

Observacion:

```text
Warning conocido: algunos chunks superan 500 kB despues de minificacion.
```

### Git diff

Comando:

```text
git diff --check
```

Resultado:

```text
OK
```

### Docker

Comando:

```text
docker compose up -d --build
docker compose ps
```

Resultado:

```text
backend: up
frontend: up
db: up, healthy
redis: up, healthy
```

### Health y Accesos

Resultados:

```text
GET http://localhost:3000/api/health -> 200
GET http://localhost:8080/accesos -> 200
```

## Estado Docker

Servicios activos al inventario:

- `comunidad-app-backend-1`: `Up`
- `comunidad-app-frontend-1`: `Up`
- `comunidad-app-db-1`: `Up (healthy)`
- `comunidad-app-redis-1`: `Up (healthy)`

Puertos:

- Backend: `3000`
- Frontend: `8080`
- PostgreSQL: `5432`
- Redis: `6379`

## Observaciones pendientes

- Push remoto pendiente por permisos `403`.
- Warning conocido de bundle frontend grande.
- Clipboard real pendiente de prueba interactiva en navegador fisico.
- Camara real pendiente de prueba en navegador/dispositivo con soporte QR.
- Responsive visual pendiente de revision manual final en desktop/tablet/mobile.

## Proximo paso recomendado para publicar

Opciones seguras:

1. Agregar la cuenta `luismelgarejo82` como collaborator con permiso **Write** en `lmelgarejo82/COMUNIDAD-APP`.
2. O reautenticar Git con la cuenta correcta que tenga permisos sobre `https://github.com/lmelgarejo82/COMUNIDAD-APP.git`.

Instruccion explicita:

```text
No usar git push --force.
No cambiar el remote salvo indicacion explicita.
No modificar credenciales desde este repo.
```

