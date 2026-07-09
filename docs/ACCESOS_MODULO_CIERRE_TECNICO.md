# Accesos / Bitácora de visitantes - Cierre técnico

## 1. Resumen ejecutivo

El módulo Accesos resuelve el registro operativo de visitas en comunidades, edificios, inquilinatos, countries y complejos con múltiples unidades. Permite saber quién ingresó, a qué unidad se dirigió, quién lo autorizó, si permanece dentro, si ya salió, si fue observado y si está demorado.

El alcance actual del MVP cubre:

- Bitácora de visitantes en `/accesos`.
- Registro manual de ingreso.
- Registro de salida idempotente.
- Detalle de visita y timeline.
- Observación manual.
- Estado demorado calculado.
- Autocomplete real de unidades.
- Rol Guardia / `access_operator`.
- Preautorizaciones de visitantes.
- Invitaciones digitales con token opaco, QR visual y validación server-side.
- Ingreso desde invitación validada.
- Fallback manual por enlace, código o token.
- Pestaña visual de escaneo QR futuro, sin cámara implementada todavía.

## 2. Jerarquía y seguridad

La jerarquía funcional del sistema queda expresada así:

```text
Organization / Administradora / Grupo
└── Community / Comunidad / Consorcio
    └── Complex / Complejo operativo
        └── Building / Torre / Bloque / Edificio
            └── Floor / Piso / Nivel
                └── Unit / Unidad / Departamento / Casa / Habitación
```

Reglas vigentes:

- `organization` es un agrupador visual y conceptual para administradoras o grupos grandes.
- `community` es la frontera principal de seguridad y negocio.
- `complex` es el alcance operativo físico dentro de una comunidad.
- `unit` es el destino físico de la visita.
- `req.communityId` es el contexto validado obligatorio para rutas protegidas.
- `req.complexId` es opcional y acota el alcance operativo cuando corresponde.
- `organization` no otorga permisos ni permite saltar entre comunidades.

El módulo Accesos debe operar siempre dentro del contexto validado por `setCommunity`. Ninguna acción de acceso, preautorización o invitación digital debe confiar en parámetros de cliente sin validación contra `req.communityId`.

## 3. Roles

### Admin

Puede:

- Ver bitácora de accesos de su comunidad.
- Registrar ingresos y salidas.
- Observar o quitar observación de visitas.
- Cancelar visitas.
- Crear, listar, filtrar, ver detalle y cancelar preautorizaciones.
- Generar, listar y revocar invitaciones digitales.
- Usar autocomplete de unidades.

No puede:

- Operar fuera de su `req.communityId` validado.
- Usar `organization` como permiso transversal.

### Guardia / access_operator

Puede:

- Acceder a `/accesos`.
- Ver y operar bitácora de visitantes.
- Registrar ingresos, salidas, observaciones y cancelaciones operativas.
- Buscar unidades con `/api/hierarchy/units/search`.
- Buscar y usar preautorizaciones pendientes.
- Validar y usar invitaciones digitales.

No puede:

- Acceder a estructura administrativa.
- Administrar expensas, pagos, usuarios, documentos ni configuración.
- Crear preautorizaciones.
- Generar o revocar invitaciones digitales.
- Operar fuera de su comunidad validada.

### Residente

Puede:

- Mantener sus permisos existentes fuera de Accesos.

No puede:

- Operar la bitácora de accesos.
- Validar o usar invitaciones digitales.
- Crear preautorizaciones en el alcance actual.
- Ganar permisos nuevos por el módulo Accesos.

## 4. Flujos implementados

### Ingreso manual

Admin o Guardia abre `/accesos`, usa `Registrar ingreso`, busca una unidad real o carga un destino manual, completa los datos del visitante y confirma. El backend crea un registro en `visitor_access_logs` con `status = inside`, `entry_at`, `created_by`, `community_id`, y opcionalmente `complex_id` y `unit_id`.

### Salida

Desde el detalle o la lista se confirma la salida de una visita activa. Se completa `exit_at`, `exited_by` y `status = exited`.

### Salida repetida idempotente

Si la salida ya fue registrada, repetir la acción no duplica efectos ni cambia indebidamente el registro. El backend devuelve el estado ya cerrado.

### Observación manual

Admin o Guardia puede marcar una visita con observación. Se guarda `observed_at`, `observed_by` y `observation_note`. El estado visual `observed` se deriva para la UI sin romper el estado persistente principal.

### Cancelación

Una visita puede cancelarse sin eliminar el registro. Se guarda `status = cancelled`, `cancelled_at` y `cancelled_by`.

### Demorado automático

El estado `delayed` es calculado para la experiencia operativa cuando una visita sigue dentro más allá del umbral definido por la lógica actual. No reemplaza el estado persistente `inside`, `exited` o `cancelled`.

### Preautorización

Admin crea una preautorización con visitante, documento, teléfono, vehículo, tipo de visita, unidad o destino, autorizado por, ventana esperada y notas. Se guarda en `visitor_preauthorizations` con `status = pending`.

### Uso de preautorización

Admin o Guardia puede usar una preautorización pendiente para crear un ingreso. El uso es transaccional e idempotente: se crea un `visitor_access_logs`, se vincula con `preauthorization_id`, y la preautorización queda `used` con `used_access_log_id` y `used_at`.

### Invitación digital

Admin genera una invitación digital sobre una preautorización pendiente. El sistema crea un token opaco, guarda solo su hash y devuelve un enlace/código para compartir manualmente o mostrar como QR.

### Validación de invitación

Admin o Guardia valida el enlace, código o token contra `/api/access-invitations/validate`. El backend valida hash, comunidad, vigencia, revocación y estado, y devuelve un resumen mínimo si corresponde.

### Ingreso desde invitación

Admin o Guardia confirma el ingreso desde `/api/access-invitations/use`. El backend registra la visita asociada a la preautorización y marca la invitación/preautorización como usada. Repetir el uso devuelve el mismo resultado operativo sin duplicar visitas.

## 5. Migraciones relacionadas

### `023_visitor_access_logs.sql`

Crea `visitor_access_logs`, tabla principal de bitácora. Incluye comunidad, complejo, unidad, datos del visitante, destino, autorización, notas, horarios, estado, observación, responsables e índices.

### `024_access_operator_role.sql`

Actualiza el constraint de roles de `users` para permitir `access_operator`, rol operativo de Guardia.

### `025_visitor_preauthorizations.sql`

Crea `visitor_preauthorizations` para visitas esperadas y agrega `preauthorization_id` a `visitor_access_logs`. Incluye estado, ventana esperada, uso idempotente y cancelación.

### `026_visitor_digital_invitations.sql`

Crea `visitor_digital_invitations` para invitaciones digitales. Guarda `token_hash`, `token_hint`, expiración, revocación, creador e índices por comunidad, preautorización, vencimiento y revocación.

## 6. Tablas principales

### `visitor_access_logs`

Propósito: registrar ingresos y salidas reales.

Campos clave:

- `community_id`: frontera de seguridad.
- `complex_id`: alcance operativo opcional.
- `unit_id`: unidad destino cuando existe en el sistema.
- `visitor_name`, `visitor_document`, `visitor_phone`, `vehicle_plate`.
- `visit_type`, `destination_label`, `authorized_by`, `notes`.
- `entry_at`, `exit_at`.
- `status`: `inside`, `exited`, `cancelled`.
- `observed_at`, `observed_by`, `observation_note`.
- `created_by`, `exited_by`, `cancelled_by`, `cancelled_at`.
- `preauthorization_id`: origen de ingreso por preautorización.

### `visitor_preauthorizations`

Propósito: registrar visitas esperadas antes del ingreso.

Campos clave:

- `community_id`, `complex_id`, `unit_id`.
- Datos de visitante y destino.
- `expected_from`, `expected_until`.
- `status`: `pending`, `used`, `cancelled`, `expired`.
- `used_access_log_id`, `used_at`.
- `created_by`, `cancelled_by`, `cancelled_at`.

### `visitor_digital_invitations`

Propósito: representar enlaces/códigos QR para una preautorización.

Campos clave:

- `community_id`.
- `preauthorization_id`.
- `token_hash`: hash del token opaco.
- `token_hint`: pista corta para soporte visual.
- `expires_at`.
- `revoked_at`, `revoked_by`.
- `created_by`.

## 7. Endpoints backend

### `/api/access-logs`

Protegido para `admin` y `access_operator`.

- `GET /api/access-logs`: lista bitácora dentro de `req.communityId`.
- `POST /api/access-logs/check-in`: registra ingreso manual.
- `GET /api/access-logs/:id`: detalle de visita.
- `POST /api/access-logs/:id/check-out`: registra salida idempotente.
- `POST /api/access-logs/:id/cancel`: cancela visita.
- `POST /api/access-logs/:id/observe`: marca observación.
- `POST /api/access-logs/:id/unobserve`: quita observación.

### `/api/hierarchy/units/search`

Protegido para `admin` y `access_operator`.

- `GET /api/hierarchy/units/search`: autocomplete real de unidades, filtrado por `req.communityId` y por `req.complexId` cuando aplica.

### `/api/access-preauthorizations`

Operación admin y búsqueda/uso operativo.

- `GET /api/access-preauthorizations`: admin lista y filtra preautorizaciones.
- `POST /api/access-preauthorizations`: admin crea preautorización.
- `GET /api/access-preauthorizations/:id`: admin ve detalle.
- `POST /api/access-preauthorizations/:id/cancel`: admin cancela pendiente.
- `GET /api/access-preauthorizations/search`: admin o Guardia busca pendientes para operar.
- `POST /api/access-preauthorizations/:id/use`: admin o Guardia usa preautorización para registrar ingreso.

### `/api/access-preauthorizations/:id/invitations`

Solo admin.

- `GET /api/access-preauthorizations/:id/invitations`: lista invitaciones de una preautorización.
- `POST /api/access-preauthorizations/:id/invitations`: genera invitación digital.
- `POST /api/access-preauthorizations/:id/invitations/:invitationId/revoke`: revoca invitación activa.

### `/api/access-invitations/validate`

Protegido para `admin` y `access_operator`.

- `POST /api/access-invitations/validate`: recibe enlace, código o token; valida server-side y devuelve resumen mínimo si la invitación es usable o ya usada.

### `/api/access-invitations/use`

Protegido para `admin` y `access_operator`.

- `POST /api/access-invitations/use`: confirma ingreso desde invitación validada. Es idempotente ante repetición.

## 8. Componentes frontend principales

- `AccessLogs`: pantalla principal `/accesos`, coordina tabs, filtros, listados y paneles.
- `AccessKpiCard`: métricas resumidas de accesos.
- `AccessTabs`: navegación entre vistas del módulo.
- `AccessFilters`: filtros de búsqueda, estado, fecha y alcance.
- `AccessVisitorList`: listado de visitas.
- `AccessVisitorCard`: tarjeta compacta por visita.
- `CheckInPanel`: panel lateral para registrar ingreso.
- `VisitDetailPanel`: detalle operativo de una visita.
- `ConfirmCheckoutModal`: confirmación de salida.
- `AccessStatusChip`: chip visual para estados.
- `AccessTimeline`: línea de eventos de la visita.
- `UnitSearchSelect`: autocomplete de unidades con fallback a destino manual.
- `ValidateInvitationPanel`: validación manual de enlace/código/token y placeholder de escaneo QR futuro.
- Componentes de preautorizaciones:
  - `PreauthorizationAdminPanel`.
  - `PreauthorizationForm`.
  - `PreauthorizationList`.
  - `PreauthorizationFilters`.
  - `PreauthorizationDetailModal`.
  - `PreauthorizationStatusChip`.
  - `DigitalInvitationPanel`.

## 9. Decisiones de seguridad

- El token de invitación es opaco.
- La base guarda `token_hash`, no el token plano.
- El QR contiene URL/código opaco, no datos personales.
- Toda validación se hace server-side.
- La invitación se valida contra `req.communityId`.
- `organization` no se usa como permiso.
- Los errores de invitación inválida, vencida o revocada son genéricos para reducir enumeración.
- `access_operator` queda limitado a Accesos y endpoints auxiliares mínimos.
- `residente` queda bloqueado en endpoints de Accesos e invitaciones.
- Las operaciones sensibles usan `setCommunity` y contexto validado.
- El uso repetido de invitación/preautorización no duplica visitas.

## 10. Validaciones y pruebas acumuladas

Estado esperado al cierre:

- Backend: 89 tests.
- Docker validado.
- `/accesos` responde 200.
- DB y Redis healthy en Docker.
- Frontend build OK.
- Warning conocido: bundle frontend mayor a 500 kB después de minificación.

Cobertura relevante acumulada:

- Aislamiento por `req.communityId`.
- Guardia limitado a Accesos.
- Residente sin permisos nuevos.
- Autocomplete de unidades validado por comunidad/complejo.
- Preautorizaciones idempotentes.
- Invitaciones digitales con hash.
- Validación y uso de token.
- Invitación usada no duplica ingreso.
- Invitación inválida, vencida o revocada devuelve error genérico.

## 11. Pendientes recomendados

- Escaneo QR por cámara opcional.
- Compartir enlace manual desde UI.
- WhatsApp automático futuro.
- Residente creando invitaciones.
- Tests frontend de navegación por teclado cuando exista infraestructura.
- Paginación visible de bitácora.
- Reportes/exportación.
- Permisos finos para supervisor o recepción.
- Push remoto pendiente por permisos 403.

## 12. Fuera de alcance actual

- OCR.
- Foto o captura de documento.
- Reconocimiento facial.
- Hardware, molinetes o portones.
- WhatsApp automático.
- Analítica avanzada.
- Integraciones externas de seguridad física.

