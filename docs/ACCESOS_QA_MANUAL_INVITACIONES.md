# QA manual guiado - Accesos e invitaciones digitales

Fecha de ejecucion: 2026-07-09 20:38:02 -03:00

## 1. Estado inicial git

- Rama: `main`
- HEAD inicial: `a7e76ee chore: improve manual invitation sharing`
- Worktree inicial: limpio
- Push remoto: no ejecutado

## 2. Entorno usado

- Repo local: `C:\dev\comunidad-app`
- Entorno: Docker Compose local
- Frontend: `http://localhost:8080`
- Backend: `http://localhost:3000`
- Healthcheck API: `GET /api/health` respondio `200`
- `/accesos` respondio HTTP `200`
- Servicios Docker:
  - `comunidad-app-backend-1`: up
  - `comunidad-app-frontend-1`: up
  - `comunidad-app-db-1`: up, healthy
  - `comunidad-app-redis-1`: up, healthy

## 3. Navegador usado

- Google Chrome local: `150.0.7871.100`
- Se intento automatizacion visual con Playwright temporal sin agregar dependencias al repo. La resolucion de modulos de `@playwright/test` via `npx` en Windows no quedo utilizable para un recorrido completo de UI.
- Se complemento el QA con validacion funcional real contra Docker por HTTP/API y checks directos con Chrome local.
- Check de soporte QR nativo en Chrome local via `BarcodeDetector`: `BARCODE_DETECTOR_NOT_SUPPORTED`.

## 4. Usuarios probados

- Admin: `admin1@comunidad.app`
  - Login OK
  - Rol devuelto: `admin`
- Guardia: `guardia1@comunidad.app`
  - Login OK
  - Rol devuelto: `access_operator`
- Residente: `vecino11@comunidad.app`
  - Login OK
  - Rol devuelto: `residente`

## 5. Checklist ejecutado

- Levantar Docker con build.
- Confirmar servicios Docker y healthcheck.
- Confirmar `/accesos` HTTP 200.
- Admin crea preautorizacion con unidad real.
- Admin genera invitacion digital.
- Backend devuelve `invitation_url`, token de un solo uso visible al generar y `token_hint`.
- Listado posterior no devuelve token plano.
- Guardia valida invitacion por enlace.
- Guardia confirma ingreso desde invitacion.
- Repeticion de uso es idempotente.
- Guardia valida codigo/token ya usado.
- Guardia valida token invalido y recibe error generico.
- Admin revoca invitacion activa.
- Guardia valida invitacion revocada y recibe error generico.
- Ingreso manual sigue funcionando.
- Observacion manual sigue funcionando.
- Salida sigue idempotente.
- Busqueda de unidades sigue funcionando.
- Permisos principales por rol.
- Check de soporte de `BarcodeDetector`.

## 6. Resultados admin

Resultado: OK.

Evidencia funcional:

```text
LOGIN_ADMIN=OK role=admin
UNIT_SEARCH=OK unit=A1B id=2
ADMIN_CREATE_PREAUTH=status:200 id=17
ADMIN_GENERATE_INVITE=status:200 has_url=True has_token=True hint=Xjz4J8hS
INVITE_LIST=status:200 listed_status=active token_plain_returned=False
ADMIN_REVOKE=status:200 message=Invitación revocada correctamente.
```

Observaciones:

- La invitacion se genera correctamente sobre una preautorizacion pendiente.
- El listado conserva `token_hint`, estado y vencimiento, pero no devuelve token plano.
- La revocacion funciona y no requiere cambios backend.

## 7. Resultados guardia

Resultado: OK.

Evidencia funcional:

```text
LOGIN_GUARD=OK role=access_operator
GUARD_VALIDATE_LINK=status:200 invitation_status=active
GUARD_USE_INVITE=status:200 invitation_status=used access_log_id=14
GUARD_USE_AGAIN=status:200 message=La invitación ya había sido usada. access_log_id=14
GUARD_VALIDATE_USED_CODE=status:200 invitation_status=used
GUARD_VALIDATE_INVALID=status:404 error={"error":"Invitación inválida o vencida."}
GUARD_VALIDATE_REVOKED=status:404 error={"error":"Invitación inválida o vencida."}
```

Observaciones:

- El flujo por enlace funciona.
- El flujo por codigo/token funciona.
- El uso repetido no duplica ingresos y conserva el mismo `access_log_id`.
- Invitacion invalida y revocada devuelven error generico.

## 8. Resultados permisos

Resultado: OK.

Evidencia:

```text
PERM_GUARD_STRUCTURE=403
PERM_GUARD_EXPENSES=403
PERM_GUARD_DOCUMENTS=403
PERM_RESIDENT_ACCESSLOGS=403
PERM_ADMIN_STRUCTURE=200
```

Interpretacion:

- Guardia queda bloqueado en estructura, expensas admin y documentos.
- Residente no puede operar access logs.
- Admin mantiene acceso a estructura.

## 9. Resultados clipboard

Resultado: GO con observacion.

Validado por revision funcional de UI/codigo:

- `Copiar enlace` copia `generated.invitation_url`.
- `Copiar código` extrae el codigo opaco desde `invitation_url`.
- `Copiar mensaje` copia el texto editable.
- El mensaje sugerido incluye:

```text
Hola. Tenés una invitación para ingresar a {contexto}.
Mostrá este enlace o QR en portería:
{invitation_url}
Vigente hasta: {expires_at}
```

Validado por API:

- El enlace existe solo al generar.
- El listado posterior no devuelve token plano.
- El QR/enlace/codigo son opacos.

Pendiente:

- Validar portapapeles real con click en navegador interactivo del usuario. La automatizacion Playwright temporal no pudo completarse por resolucion de modulos de `@playwright/test` en Windows via `npx`, sin instalar dependencias en el repo.

## 10. Resultados camara/QR

Resultado: GO con observacion.

Evidencia:

```text
Chrome local BarcodeDetector: BARCODE_DETECTOR_NOT_SUPPORTED
```

Interpretacion:

- En este Chrome local, la API nativa `BarcodeDetector` no esta disponible para lectura QR.
- La UI debe mostrar fallback manual.
- No se probo lectura real con camara fisica porque el soporte nativo requerido por el navegador no esta disponible en esta ejecucion.

Pendiente:

- Probar en un navegador/dispositivo con `BarcodeDetector` disponible o decidir una libreria liviana de lectura QR si se necesita soporte mas amplio.
- Probar permiso permitido y denegado en dispositivo fisico con camara.

## 11. Resultados responsive

Resultado: GO con observacion.

Revision tecnica:

- Los paneles relevantes usan anchos fluidos:
  - `ValidateInvitationPanel`: `width: min(460px, 100%)`
  - `CheckInPanel`: `width: min(460px, 100%)`
  - `VisitDetailPanel`: `width: min(500px, 100%)`
  - `PreauthorizationDetailModal`: `width: min(620px, 100%)`
- Las grillas principales usan `auto-fit`/`minmax`, por lo que degradan a una columna en anchos chicos.
- Los botones usan `flexWrap`.

Pendiente:

- Validar visualmente en navegador interactivo con viewport desktop, tablet y mobile. No se detecto bloqueo funcional en build ni API.

## 12. Bugs encontrados

No se encontraron bugs bloqueantes en backend ni en flujo funcional.

Observaciones no bloqueantes:

- `BarcodeDetector` no esta soportado en el Chrome local usado para esta ejecucion.
- Clipboard real por click queda pendiente de prueba interactiva, aunque el flujo funcional y la implementacion de copiado estan acotados al token/enlace generado.
- El warning de bundle frontend mayor a 500 kB sigue presente.

## 13. Correcciones aplicadas

No se aplicaron correcciones funcionales en este bloque.

Unico cambio realizado:

- Creacion de este documento de QA.

## 14. Pendientes recomendados

- QA interactivo en navegador con usuario presente para:
  - click real en `Copiar enlace`
  - click real en `Copiar código`
  - click real en `Copiar mensaje`
  - pegado posterior del portapapeles
- Prueba de camara en dispositivo compatible.
- Evaluar libreria liviana de lectura QR si `BarcodeDetector` no cubre los navegadores objetivo.
- Agregar infraestructura de tests frontend si el modulo sigue creciendo.
- Revisar code splitting para reducir warning de bundle grande.
- Mantener push remoto pendiente hasta resolver permisos 403.

## 15. Decision final

Decision: **GO con observaciones**.

Motivo:

- Los flujos criticos admin a guardia pasan.
- La seguridad server-side se mantiene.
- No se guarda token plano.
- Guardia y residente quedan correctamente limitados.
- Ingreso manual, salida idempotente, observacion y busqueda de unidades siguen funcionando.
- Quedan observaciones de QA fisico/interactivo para clipboard y camara, no bloqueantes para el MVP porque el fallback manual funciona y el backend valida todo server-side.

