# Accesos: diseño técnico para QR e invitaciones digitales

## 1. Objetivo del módulo futuro

Preparar una capa de invitaciones digitales sobre las preautorizaciones de visitantes existentes.

El objetivo funcional es que una preautorización pueda generar una invitación compartible para el visitante, idealmente representada como QR, y que el guardia pueda validar esa invitación desde Accesos antes de registrar el ingreso.

En una fase posterior, la invitación podrá compartirse por WhatsApp, sin que WhatsApp sea requerido para operar el control de accesos.

## 2. Alcance MVP futuro

El MVP futuro debería cubrir:

- Generar un token seguro asociado a una preautorización.
- Mostrar un QR al admin, y eventualmente al residente si se habilita ese rol.
- Permitir que el guardia escanee el QR o ingrese un código manual.
- Validar el token siempre contra backend.
- Confirmar que la preautorización pertenece al contexto comunitario permitido.
- Verificar vigencia, estado y revocación antes de permitir el ingreso.
- Mostrar al guardia datos mínimos para confirmar identidad y destino.
- Registrar el ingreso usando el flujo existente de preautorizaciones.

El uso exitoso debe terminar igual que hoy:

- `visitor_preauthorizations.status = used`
- `visitor_preauthorizations.used_at` informado
- `visitor_preauthorizations.used_access_log_id` vinculado
- `visitor_access_logs.preauthorization_id` vinculado

## 3. Fuera de alcance inicial

No incluir en la primera implementación:

- Envío automático por WhatsApp.
- Pagos.
- OCR.
- Foto o documento adjunto.
- Hardware dedicado.
- Reconocimiento facial.
- Integración con portones o barreras.
- Invitaciones públicas sin preautorización.
- Permisos por organización como frontera de seguridad.

## 4. Modelo propuesto

Hay dos alternativas razonables. La decisión final debe tomarse antes de implementar.

### Opción A: columnas en `visitor_preauthorizations`

Campos sugeridos:

- `token_hash`
- `token_expires_at`
- `token_used_at`
- `token_revoked_at`
- `qr_status`
- `invitation_sent_at`
- `invitation_viewed_at`

Ventaja: simple para MVP.

Riesgo: si después hay múltiples invitaciones por una misma preautorización, la tabla queda limitada.

### Opción B: tabla separada `visitor_invitations`

Campos sugeridos:

- `id`
- `preauthorization_id`
- `community_id`
- `token_hash`
- `expires_at`
- `used_at`
- `revoked_at`
- `sent_at`
- `viewed_at`
- `status`
- `created_by`
- `created_at`
- `updated_at`

Ventaja: soporta reemisiones, revocaciones y auditoría más clara.

Riesgo: agrega una tabla y más lógica desde el inicio.

### Recomendación

Para MVP, usar tabla separada si se prevé QR/WhatsApp/residente. Aunque sea un poco más trabajo, evita mezclar el estado operativo de la preautorización con el ciclo de vida de la invitación digital.

La preautorización sigue siendo la entidad de negocio. La invitación digital es un mecanismo de presentación y validación asociado a esa preautorización.

## 5. Seguridad

Reglas obligatorias para implementación futura:

- No guardar token plano si no hace falta.
- Guardar `token_hash` usando hash fuerte.
- Generar tokens con entropía suficiente.
- El QR debe contener una URL o código opaco, no datos personales.
- No incluir nombre, documento, teléfono, patente ni unidad dentro del QR.
- La validación debe ser siempre server-side.
- La expiración debe ser obligatoria.
- Debe existir revocación.
- Debe auditarse generación, validación, uso y revocación.
- No permitir saltar `req.communityId`.
- No usar `organization` como autorización.
- El guardia solo debe validar invitaciones dentro de su comunidad operativa.
- Si existe `complex_id`, validar que corresponda a la comunidad.
- Si existe `unit_id`, validar que corresponda a la comunidad.

### Token de un solo uso o reutilizable

La recomendación inicial es token de un solo uso para visitas comunes.

Para entradas recurrentes o servicios programados, no reutilizar este mismo mecanismo sin diseñar reglas adicionales. Las visitas recurrentes quedan fuera del MVP.

### Datos mostrados al guardia

Después de validar el token, el backend puede devolver datos mínimos:

- nombre del visitante
- documento parcial o completo según decisión de privacidad
- patente si existe
- tipo de visita
- destino
- autorizado por
- ventana de vigencia
- estado

La pantalla de validación no debe exponer más datos que el panel operativo actual.

## 6. Flujo QR

Flujo propuesto:

1. Admin crea una preautorización.
2. Sistema genera invitación digital asociada a esa preautorización.
3. Sistema muestra un QR y un enlace copiable.
4. Visitante recibe o porta el QR.
5. Guardia abre vista de escaneo o ingreso manual de código.
6. Sistema valida token en backend.
7. Backend verifica estado, expiración, revocación y comunidad.
8. Sistema muestra datos mínimos de la visita.
9. Guardia confirma ingreso.
10. Backend usa el flujo transaccional existente de preautorización.
11. Preautorización queda `used`.
12. Access log queda creado y vinculado.

El QR no debe registrar ingreso automáticamente. Debe asistir la validación, pero la acción final sigue siendo confirmación del guardia.

## 7. Flujo WhatsApp futuro

El envío por WhatsApp debe incorporarse por fases:

### Envío manual primero

El sistema muestra:

- QR
- enlace
- botón copiar enlace
- texto sugerido para compartir

El admin copia y envía manualmente por WhatsApp u otro canal.

### Envío automático después

Cuando se incorpore proveedor:

- usar plantilla aprobada si el proveedor lo exige
- registrar `sent_at`
- registrar error de envío si falla
- no bloquear la operación si WhatsApp falla
- permitir copiar enlace como fallback

### Plantilla sugerida

Texto base:

> Tenés una invitación para ingresar a {comunidad}. Presentá este código en el acceso: {link}. Vigente hasta {fecha_hora}.

Evitar incluir documento, teléfono, notas internas u otros datos personales.

### Fallback si no hay teléfono

Si no hay teléfono:

- mostrar QR
- permitir copiar enlace
- permitir descargar o imprimir QR en fase futura

## 8. Estados

Estados operativos actuales de preautorización:

- `pending`
- `used`
- `cancelled`
- `expired`

Estados futuros de invitación:

- `pending`: invitación generada, no enviada.
- `sent`: invitación compartida o marcada como enviada.
- `viewed`: visitante abrió el enlace, si se decide medirlo.
- `used`: invitación usada para registrar ingreso.
- `expired`: venció la ventana de vigencia.
- `cancelled`: preautorización cancelada.
- `revoked`: invitación anulada sin cancelar necesariamente la preautorización.

No conviene mezclar todos los estados en `visitor_preauthorizations.status`. La preautorización describe la visita esperada; la invitación describe el canal digital.

## 9. UI futura

Elementos sugeridos:

- Botón `Generar invitación`.
- Modal `Compartir invitación`.
- QR visible.
- Botón `Copiar enlace`.
- Estado de invitación.
- Acción `Revocar invitación`.
- Acción `Regenerar invitación`, si se decide soportar reemisión.
- Vista de escaneo para guardia.
- Campo manual para ingresar código si la cámara falla.

En Accesos, el guardia debería ver:

- pantalla compacta de escaneo
- resultado validado
- datos mínimos
- botón `Registrar ingreso`
- errores claros para vencida, cancelada, usada o inválida

## 10. Riesgos

Riesgos principales:

- Reenvío de QR a otra persona.
- Captura de pantalla del QR.
- Expiración demasiado larga.
- Expiración demasiado corta para operación real.
- Uso fuera de comunidad.
- Filtración de datos personales si el QR contiene información legible.
- Dependencia externa de WhatsApp.
- Fallas de cámara o permisos del navegador.
- Guardia registrando ingreso sin validar identidad visualmente.

Mitigaciones:

- Token opaco.
- Expiración obligatoria.
- Revocación.
- Confirmación manual del guardia.
- Auditoría.
- No depender de WhatsApp.
- Fallback de ingreso manual de código.

## 11. Decisiones pendientes

Antes de implementar hay que decidir:

- Token de un solo uso o multiuso.
- Duración por defecto.
- Si se permite regenerar invitación.
- Si revocar invitación cancela o no la preautorización.
- Quién puede generar invitaciones.
- Si residente podrá crear preautorizaciones.
- Si guardia escanea desde navegador o ingresa código manual.
- Si se usa tabla separada o columnas en `visitor_preauthorizations`.
- Qué datos exactos se muestran al visitante.
- Qué datos exactos se muestran al guardia.
- Si se registra `viewed`.
- Si se permite imprimir QR.

## 12. Propuesta de fases

### Fase A: token seguro + QR visual

- Crear modelo de invitación.
- Generar token seguro.
- Guardar hash.
- Mostrar QR y enlace copiable.
- Revocar invitación.

### Fase B: validación QR por guardia

- Vista de escaneo o ingreso manual.
- Endpoint de validación server-side.
- Mostrar datos mínimos.
- Confirmar ingreso usando preautorización existente.

### Fase C: compartir enlace manual

- Modal de compartir.
- Copiar enlace.
- Texto sugerido.
- Estado manual `sent` si se requiere.

### Fase D: WhatsApp automático

- Integrar proveedor.
- Plantilla aprobada.
- Registro de envío y error.
- Fallback manual obligatorio.

### Fase E: residente crea invitación

- Definir permisos.
- Validar unidad propia.
- Crear preautorización limitada.
- Permitir generar invitación.
- Mantener administración y guardia como control operativo.

## 13. Contrato de seguridad a preservar

El diseño futuro no debe alterar estos contratos actuales:

- `req.communityId` sigue siendo frontera principal de seguridad.
- `organization` no habilita acceso cruzado.
- `complex_id` es alcance operativo, no permiso superior.
- Guardia no administra preautorizaciones.
- Guardia solo valida y usa invitaciones/preautorizaciones permitidas.
- Uso de preautorización sigue siendo idempotente.
- Access log queda vinculado a preautorización.
