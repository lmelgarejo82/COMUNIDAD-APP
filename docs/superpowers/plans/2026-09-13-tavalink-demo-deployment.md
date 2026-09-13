# Plan de despliegue de la demo privada de Tavalink

Fecha: 2026-09-13  
Repositorio: `COMUNIDAD-APP`  
Rama de trabajo: `feat/tavalink-demo-deployment`

## Alcance y restricciones

- Publicar exclusivamente Comunidad App en `https://demo.tavalink.com.py`.
- Reservar y no configurar `app.tavalink.com.py`.
- No modificar TAVALINK-LANDING, `tavalink.com.py`, otros vhosts, stacks, certificados o servicios del VPS.
- Mantener PostgreSQL, Redis, uploads, red y secretos exclusivos del proyecto Compose `tavalink-demo`.
- Mantener el login normal, JWT, RBAC y `req.communityId` como frontera tenant. El frontend nunca decide el tenant.
- Deshabilitar el autorregistro y toda integración con side effects reales.
- No almacenar credenciales ni secretos en Git, bundles, seeds versionados o logs públicos.

## Estado observado

- `main` estaba limpio y alineado con `origin/main` en `dc6b6f4` antes de crear la rama.
- Stack: Node 22/Express/PostgreSQL/Redis/Bull/cron y React/Vite/Nginx.
- El Compose de desarrollo expone PostgreSQL y Redis públicamente y usa credenciales fijas; no es apto para demo.
- El backend ya valida secretos, origen público y proxy; `/api/health` existe y proyecta capacidades sin secretos.
- Las capacidades de Mercado Pago, DeepSeek y Twilio fallan cerradas si sus variables están vacías.
- SMTP puede producir correo real si recibe credenciales. Los recordatorios cron escriben notificaciones internas. Bull genera subtickets internos y sólo intenta WhatsApp si se configura; en demo conservará la cola con Redis aislado y WhatsApp deshabilitado.
- El autorregistro público ya se controla con `PUBLIC_REGISTRATION_ENABLED=false`; los flujos por invitación continúan disponibles.
- El producto tiene tres roles técnicos: `admin`, `residente` y `access_operator`. La UI presenta `access_operator` como “Guardia”. Para las dos identidades solicitadas de guardia y operador se crearán usuarios separados con el rol técnico `access_operator`.
- El seed actual es destructivo para toda la base, usa credenciales públicas y datos genéricos; no se reutilizará para la demo.
- Baseline válido tras `npm ci`: frontend 126/126 PASS y build PASS. Backend 382 PASS, 3 FAIL y 7 SKIP; los tres fallos dependen de Docker ausente en esta estación. QA visual 2 FAIL por falta de Playwright/Chrome configurados.

## Cambios a implementar con TDD

1. Crear tests que fallen para las invariantes del entorno demo:
   - reset aborta sin `DEMO_ENV=true` y sin nombre de base inequívocamente demo;
   - el seed no contiene passwords fijos y exige las cuatro credenciales por entorno;
   - Compose no publica DB/Redis/backend, enlaza frontend sólo a loopback, usa volúmenes/red propios, healthchecks y capacidades externas apagadas;
   - Nginx interno expone `robots.txt`, `X-Robots-Tag` y health del frontend.
2. Crear `deploy/demo/docker-compose.demo.yml` con imágenes construidas desde este repo, recursos aislados, secrets por `.env`, healthchecks y reinicio `unless-stopped`.
3. Crear `src/backend/scripts/reset-demo.js`, transaccional e idempotente, que sólo borre la comunidad marcada por un access code reservado, vuelva a crear datos ficticios convincentes y aborte fuera de una base demo. Las cuatro passwords entrarán sólo por variables de entorno.
4. Añadir scripts operativos de reset/credenciales que no impriman secretos y documentación privada de despliegue sin valores sensibles.
5. Ajustar la imagen frontend/Nginx para healthcheck, same-origin `/api` y `/uploads`, SPA refresh, robots bloqueado y cabecera noindex.
6. Crear plantilla de vhost externo sólo para `demo.tavalink.com.py`, con proxy a loopback, redirección HTTP→HTTPS y cabecera noindex. Certbot completará únicamente las rutas del certificado de ese hostname en el VPS.
7. Añadir `.qa/tavalink-demo-access` a `.gitignore` antes de cualquier clave temporal.

## Gate local

- Ejecutar tests nuevos en rojo antes de implementar y en verde después.
- Ejecutar suite backend, suite frontend y build.
- Validar Compose renderizado en una máquina con Docker.
- Inspeccionar bundles y Git buscando secretos, emails/passwords indebidos y claves privadas.
- Hacer commits pequeños: plan, pruebas/configuración, seed/reset y documentación operativa.

## Acceso, DNS e inspección del VPS

1. Verificar DNS autoritativo, 1.1.1.1 y 8.8.8.8 para `demo.tavalink.com.py` = `62.171.137.144`.
2. Probar SSH no interactivo a `mathias@62.171.137.144:1122` con claves existentes.
3. Si falla, crear `.qa/tavalink-demo-access` ED25519 temporal, mostrar únicamente el comando de instalación de la pública y detenerse hasta que Luis la instale.
4. Ya con acceso, capturar antes de cambios: `docker ps`, `docker compose ls`, `ss -lntup`, `nginx -T`, `df -h`, `free -h`; inventariar nombres, puertos, redes y vhosts ajenos.

## Despliegue aislado

1. Crear `/opt/tavalink-demo`, checkout de la rama/commit aprobado y `.env` modo 600 con secretos aleatorios.
2. Construir con `docker compose -p tavalink-demo -f deploy/demo/docker-compose.demo.yml`.
3. Levantar DB y Redis; migrar; ejecutar reset demo manual; levantar backend y frontend.
4. Guardar las cuatro credenciales sólo en `/opt/tavalink-demo/DEMO-CREDENTIALS.txt` modo 600.
5. Confirmar contenedores healthy, puertos sólo internos salvo frontend en `127.0.0.1`, red y volúmenes exclusivos.
6. Instalar únicamente el vhost demo, ejecutar `nginx -t` y recargar sólo si pasa.
7. Emitir certificado sólo para `demo.tavalink.com.py`, repetir `nginx -t`, recargar y comprobar renovación.

## QA público y recuperación

- Verificar HTTP 200, redirección HTTPS, certificado/hostname, assets, refresh SPA, robots y X-Robots-Tag.
- Probar login inválido, login/logout de las cuatro identidades, rutas sin auth, API sin token, RBAC y aislamiento tenant.
- Confirmar capabilities externas en falso y ausencia de secretos en HTML/JS/logs públicos.
- Probar reset manual dos veces y verificar resultado idempotente.
- Reiniciar controladamente todo el stack y verificar usuarios, seed y uploads persistentes.
- Comparar servicios/vhosts ajenos antes y después.

## Cierre

- Reunir evidencia exacta para el reporte solicitado y no declarar PASS si queda una comprobación sin evidencia.
- Retirar la clave temporal de `authorized_keys`, verificar que dejó de autenticar y borrar la privada local.
- Dejar el árbol Git limpio, registrar relación con main/origin y entregar credenciales únicamente en el reporte privado de esta conversación.
