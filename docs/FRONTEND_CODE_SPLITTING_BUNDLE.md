# Frontend code splitting y bundle inicial

## Estado inicial

- Rama: `main`.
- HEAD inicial del bloque: `af4bd63 fix: prevent floating actions blocking screens`.
- El build frontend generaba un chunk inicial grande:
  - `dist/assets/index-BvCTKSv1.js`: `803.64 kB`, gzip `245.66 kB`.
- Vite advertia que algunos chunks superaban `500 kB`.

## Diagnostico

`App.jsx` importaba de forma estatica paginas completas aunque no fueran necesarias en la primera carga:

- `Expensas`
- `Anuncios`
- `Tickets`
- `InviteResidente`
- `Audit`
- `Amenities`
- `Documents`
- `HierarchyEditor`
- `AccessLogs`

Ademas, el layout cargaba `ChatWidget` dentro del bundle principal y el panel de invitacion digital cargaba `qrcode` aunque el usuario no generara ni visualizara una invitacion.

## Decision aplicada

Se aplico code splitting conservador:

- Mantener login, registro, dashboard, layout y providers en carga directa.
- Diferir modulos pesados por ruta usando `React.lazy` y `Suspense`.
- Diferir `ChatWidget` porque es soporte flotante y no bloquea la navegacion principal.
- Diferir `qrcode` hasta que exista una invitacion digital con URL para renderizar QR.

No se modificaron contratos backend, permisos, rutas publicas ni comportamiento funcional.

## Rutas lazy

- `/expensas`
- `/anuncios`
- `/tickets`
- `/invite`
- `/audit`
- `/amenities`
- `/documents`
- `/estructura`
- `/accesos`

Las rutas legacy se mantienen como redireccion:

- `/admin/estructura` -> `/estructura`
- `/unidades` -> `/estructura`

## Componentes y librerias lazy

- `ChatWidget`
- `qrcode`

## Resultado del build

Build posterior:

- `dist/assets/index-DMUG4C5I.js`: `323.00 kB`, gzip `104.64 kB`.
- No se emitio warning de chunk mayor a `500 kB`.

Chunks principales generados:

- `Tickets-BQ9W4RTR.js`: `29.14 kB`, gzip `7.96 kB`.
- `AccessLogs-BtCXvrTh.js`: `59.94 kB`, gzip `13.70 kB`.
- `HierarchyEditor-Bz6YQ7nx.js`: `83.72 kB`, gzip `23.73 kB`.
- `Amenities-BnqysHKq.js`: `253.73 kB`, gzip `80.20 kB`.
- `browser-BPrkVOeF.js`: `25.78 kB`, gzip `10.13 kB`, generado por carga diferida de QR.

## Rutas a validar

- `/dashboard`
- `/tickets`
- `/accesos`
- `/estructura`
- `/admin/estructura`
- `/unidades`

## Observaciones pendientes

- `Amenities` sigue siendo el chunk de ruta mas grande por su logica y estilos propios. No se dividio mas para evitar cambios funcionales fuera del objetivo.
- Si el proyecto crece, conviene revisar split por subpaneles en modulos grandes como `Amenities`, `AccessLogs` y `HierarchyEditor`.
