# QA visual/responsive - Tickets / Reclamos

## Estado inicial git

- Rama: `main`
- HEAD inicial: `86fd325 feat: redesign tickets experience`
- Estado inicial observado: `main...origin/main [ahead 1]`
- Observacion: existia un directorio `.vs/` sin trackear al iniciar el bloque. No se modifico ni se incluyo en el commit.

## Entorno usado

- Docker Compose local.
- Backend: `http://localhost:3000`
- Frontend: `http://localhost:8080`
- Base de datos y Redis en servicios Docker.
- Capturas visuales temporales generadas con Chrome headless mediante DevTools Protocol.
- Las capturas se guardaron fuera del repo en `C:\tmp\comunidad-ticket-qa-shots-*` y no forman parte del commit.

## Navegador usado

- Google Chrome headless instalado localmente.
- Viewports revisados:
  - Desktop: `1366x900`
  - Mobile: `390x900`
  - Tablet: validacion responsive por reglas de layout intermedias y comportamiento de grillas/filtros.

## Usuarios probados

- Admin: `admin1@comunidad.app`
- Residente: `vecino11@comunidad.app`
- Guardia / access_operator: `guardia1@comunidad.app`

## Checklist residente

- Login residente: OK.
- Acceso a `/tickets`: OK.
- Titulo `Tickets / Reclamos`: OK.
- Subtitulo residente con contador de activos: OK.
- KPIs visibles y compactos: OK.
- Tabs `Todos` y `Mios`: OK.
- Filtros visibles: OK.
- Creacion de ticket con categoria/prioridad/ubicacion: OK.
- Panel lateral `Crear ticket`: OK.
- Categorias visuales como cards/pills: OK.
- Prioridades visuales: OK.
- Campos obligatorios: OK por validacion existente.
- Mensaje de exito/error: OK.
- Listado de tickets propios: OK.
- Filtros por estado/categoria/prioridad: OK.
- Detalle con timeline: OK.
- No ve tickets de otra comunidad: OK, API devuelve `403` al forzar otra comunidad.

## Checklist admin

- Login admin: OK.
- Acceso a `/tickets`: OK.
- Titulo/subtitulo admin: OK.
- KPIs visibles: OK.
- Tabs `Todos`, `Mios`, `Sin asignar`, `Vencidos`: OK.
- Listado de tickets de comunidad: OK.
- Filtros por estado/categoria/prioridad: OK.
- Panel lateral de detalle: OK.
- Chips de estado/prioridad/categoria: OK.
- Legibilidad de unidad/ubicacion: OK tras correccion.
- Cambio de estado `in_review > in_progress > resolved`: OK.
- Campo de nota visual: OK.
- Checkbox visual `Notificar al residente`: OK, sin envio real.
- No opera tickets de otra comunidad: cubierto por tests existentes y flujo de seguridad.

## Checklist permisos

- Guardia / access_operator en tickets: bloqueado con `403`.
- Guardia mantiene `/accesos`: OK, `/accesos` responde `200`.
- Residente no gana permisos admin: OK.
- Admin mantiene acceso admin a tickets: OK.

## Checklist responsive

- Desktop:
  - Tabla/lista legible.
  - KPIs y filtros alineados.
  - Panel lateral de creacion y detalle legible.
- Mobile:
  - Cards en lugar de tabla.
  - KPIs en grilla de dos columnas.
  - Filtros en una columna.
  - Cards sin overflow horizontal.
  - Chips legibles.
- Tablet:
  - Grillas usan `auto-fit` y cortes compactos.
  - Filtros pasan a layout compacto cuando el viewport es angosto.

## Bugs encontrados

1. En mobile, los botones flotantes globales de contacto podian tapar chips del primer card.
2. En el panel lateral de creacion, los mismos botones flotantes podian superponerse al boton `Enviar ticket`.
3. En el detalle, los labels quedaban pegados a los valores (`UbicacionPorton`).
4. El buscador desktop quedaba demasiado angosto y cortaba el placeholder antes de tiempo.

## Correcciones aplicadas

- Se agrego reserva de espacio en el encabezado de cards compactas.
- Se agrego margen/padding derecho e inferior en acciones del panel lateral.
- Se separaron labels y valores del bloque de detalle.
- Se amplio el ancho base del buscador en desktop.

## Validaciones ejecutadas

- `docker compose up -d --build`: OK.
- `docker compose ps`: backend/frontend/db/redis arriba; DB y Redis healthy.
- `GET /api/health`: `200`.
- `GET /tickets`: `200`.
- `GET /accesos`: `200`.
- `npm test` en `src/backend`: OK, 96 tests pasan.
- `npm run build` en `src/frontend`: OK.
- `git diff --check`: OK, solo warning CRLF de Windows.

## Observaciones pendientes

- El warning de bundle grande de Vite sigue existiendo y no se aborda en este bloque.
- Los botones flotantes globales siguen presentes sobre la UI por diseno general de la app; Tickets ahora reserva espacio local para que no tapen informacion/acciones criticas.
- No se implementaron features fuera de alcance: adjuntos, SLA real, asignacion, notificaciones reales.
- Existe `.vs/` sin trackear, previo a este bloque; queda fuera del commit.

## Decision final

GO con observaciones.
