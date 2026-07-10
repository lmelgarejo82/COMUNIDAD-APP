# QA botones flotantes globales

## Botones encontrados

- `ChatWidget`
  - Componente: `src/frontend/src/components/ChatWidget.jsx`
  - Accion: abre asistente virtual.
  - Render global previo: todas las pantallas autenticadas desde `Layout`.
  - Posicion previa: `fixed`, abajo derecha, `z-index` 199 para boton y 200 para panel.

- `WhatsAppButton`
  - Componente: `src/frontend/src/components/WhatsAppButton.jsx`
  - Accion: abre enlace manual de WhatsApp al telefono configurado.
  - Render global previo: todas las pantallas autenticadas desde `Layout`.
  - Posicion previa: `fixed`, arriba del chat, `z-index` 198.

## Diagnostico visual

- Los flotantes globales aparecian sobre pantallas con acciones criticas y paneles laterales.
- Los `z-index` previos eran mayores que overlays de Tickets y Accesos, por lo que podian quedar por encima de:
  - panel `Crear ticket`
  - panel detalle de ticket
  - paneles de Accesos
  - cards y chips en mobile
- En mobile el espacio util es menor y los dos flotantes apilados podian bloquear informacion o acciones.

## Decision UX aplicada

- Mantener las acciones globales en desktop, sin eliminarlas.
- Ocultar flotantes globales en mobile/tablet angosto (`width < 768`) para evitar bloqueo de acciones.
- Ocultar flotantes mientras el menu mobile o el dropdown de notificaciones esta abierto.
- Reducir tamano de los botones de `56px` a `48px`.
- Bajar prioridad visual:
  - Chat button: `z-index: 90`
  - WhatsApp button: `z-index: 89`
  - Chat panel: `z-index: 120`
- Mantenerlos por debajo de overlays/paneles laterales de operacion.
- Agregar reserva inferior global en `main` para que el final del contenido no quede debajo de flotantes en desktop.

## Pantallas revisadas

- `/tickets`
  - Desktop: flotantes visibles, reducidos.
  - Mobile: flotantes ocultos.
  - Panel `Crear ticket`: overlay `z-index: 180`, flotantes quedan por debajo.

- `/accesos`
  - Desktop: flotantes visibles, reducidos.
  - Mobile: flotantes ocultos.
  - Panel de operacion: flotantes quedan por debajo del flujo principal.

- `/estructura`
  - Desktop: flotantes visibles en zona inferior derecha.
  - Mobile: flotantes ocultos.

- Rutas legacy:
  - `/admin/estructura` redirige a `/estructura`.
  - `/unidades` redirige a `/estructura`.

## Correcciones aplicadas

- `Layout.jsx`
  - Se agrego `showFloatingSupport`.
  - Se ocultan flotantes en mobile/tablet angosto, menu mobile abierto o dropdown de notificaciones abierto.
  - Se agrego padding inferior al `main`.

- `ChatWidget.jsx`
  - Boton reducido a `48px`.
  - Posicion ajustada a `bottom/right: 16px`.
  - `z-index` del boton reducido a `90`.
  - Panel reducido levemente y `z-index` ajustado a `120`.

- `WhatsAppButton.jsx`
  - Boton reducido a `48px`.
  - Posicion ajustada a `right: 16px`, `bottom: 72px`.
  - `z-index` reducido a `89`.

## Validaciones

- `npm test` backend: OK.
- `npm run build` frontend: OK.
- `git diff --check`: OK.
- `docker compose up -d --build`: OK.
- `docker compose ps`: backend/frontend/db/redis arriba; DB y Redis healthy.
- `/api/health`: 200.
- `/tickets`: 200.
- `/accesos`: 200.
- `/estructura`: 200.

## Pendientes

- Evaluar en un bloque futuro si conviene consolidar WhatsApp y Chat en un unico menu de soporte.
- Revisar con QA humano si el soporte global debe estar disponible en mas pantallas o solo dashboard/residente.
- El warning de bundle grande de Vite permanece fuera de alcance.

## Decision final

GO con observaciones.
