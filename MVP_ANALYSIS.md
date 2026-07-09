# MVP Functional & Technical Overview

> Análisis completo del código fuente — Julio 2026  
> Comunidad App v1.0.0

---

## 1. Executive Summary

### Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Backend runtime | Node.js | 22.17.0 |
| Framework HTTP | Express | 4.21.2 |
| Base de datos | PostgreSQL | 18 |
| ORM / Driver | pg (raw SQL) | 8.13.1 |
| Autenticación | JWT (jsonwebtoken) | 9.0.2 |
| Hashing | bcrypt | 5.1.1 |
| Email | nodemailer (Ethereal) | último |
| Uploads | multer | último |
| Frontend framework | React | 19.0.0 |
| Build tool | Vite | 6.4.3 |
| Router | react-router-dom | 7.1.3 |
| HTTP client | axios | 1.7.9 |
| Env vars | dotenv | 16.4.7 |
| Dev runner | concurrently | 9.1.2 |
| Backend watcher | nodemon | 3.1.9 |

### Estructura del monorepo

```
comunidad-app/
├── package.json                    # Scripts raíz: dev, db:migrate, db:seed, db:setup
├── AGENTS.md                       # Convenciones del proyecto
├── .gitignore
└── src/
    ├── backend/
    │   ├── server.js               # Express: 6 rutas, CORS, static /uploads
    │   ├── db.js                   # Pool pg (connectionString desde .env)
    │   ├── seed.js                 # TRUNCATE + INSERT con 2 comunidades, 12 usuarios, 6 expensas, etc.
    │   ├── .env                    # DATABASE_URL, JWT_SECRET, EMAIL_*
    │   ├── controllers/            # 6 controladores (auth, dashboard, expense, announcement, ticket, notification)
    │   ├── models/                 # 6 modelos (User, Dashboard, Expense, Announcement, Ticket, Notification)
    │   ├── routes/                 # 6 routers Express
    │   ├── middleware/             # authenticate (JWT), authorize (roles)
    │   ├── migrations/            # 4 archivos SQL (001 → 004)
    │   └── uploads/               # Archivos subidos (multer)
    └── frontend/
        ├── vite.config.js          # Proxy: /api, /uploads → :3000
        ├── index.html
        └── src/
            ├── main.jsx            # React entry
            ├── App.jsx             # Routes con ProtectedRoute + Layout
            ├── components/         # Layout (header + nav + notif bell), ProtectedRoute
            ├── context/            # AuthContext (login, logout, localStorage)
            ├── pages/              # 9 páginas: Login, Register, Dashboard, DashboardAdmin,
            │                         DashboardResidente, Expensas, CreateExpensa, Anuncios, Tickets
            └── services/           # api.js (axios + JWT), expensas.js, comunicacion.js
```

### Base de datos — 11 tablas

| Tabla | Migración | Propósito |
|---|---|---|
| `communities` | 001 | Comunidades con access_code único |
| `users` | 001 | Usuarios con role CHECK ('admin', 'residente') |
| `expensas` | 002 | **Legacy** — expensas para dashboard residente |
| `pagos` | 002 | **Legacy** — pagos para dashboard residente |
| `expenses` | 003 | Expensas del módulo completo |
| `unit_expenses` | 003 | Desglose por unidad con status (pending/in_review/paid) |
| `announcements` | 004 | Anuncios con file_url |
| `announcement_reads` | 004 | Tracking de lectura por usuario |
| `tickets` | 004 | Tickets con status (sent/in_progress/resolved) |
| `ticket_replies` | 004 | Respuestas a tickets |
| `notifications` | 004 | Notificaciones in-app con is_read |

---

## 2. Module-by-Module Analysis

### 2.1 Autenticación

#### Frontend
- **Login** (`/login`): Formulario email + password. Llama a `AuthContext.login()` → `POST /api/auth/login`. Error se muestra como alert inline rojo. Link a `/register`.
- **Register** (`/register`): Formulario email + password (min 6) + access_code + unit_number (opcional). Usa `fetch()` directo (no pasa por axios con interceptor). Al registrarse exitosamente, guarda token y user en localStorage y redirige con `window.location.href`.
- **AuthContext**: Provee `user`, `login()`, `logout()`, `loading`. Persiste `user` en localStorage. `login()` llama a `/api/auth/login`, guarda token en localStorage, actualiza state.
- **ProtectedRoute**: Wrapper declarativo. Si no hay `user` en contexto → `<Navigate to="/login">`.

#### Backend API

| Método | Ruta | Auth | Body / Params | Respuesta |
|---|---|---|---|---|
| POST | `/api/auth/register` | Público | email, password, access_code, unit_number? | `{ user, token }` |
| POST | `/api/auth/login` | Público | email, password | `{ user, token }` |
| POST | `/api/auth/forgot-password` | Público | email | `{ message }` (envía link Ethereal) |
| POST | `/api/auth/reset-password/:token` | Público | password | `{ message }` |

#### Modelos de datos

**communities**: `id SERIAL PK`, `name`, `address`, `access_code UNIQUE`, `created_at`

**users**: `id SERIAL PK`, `email UNIQUE`, `password_hash`, `role CHECK('admin','residente')`, `unit_number`, `community_id FK`, `reset_token`, `reset_token_expires`, `created_at`

#### Workflow de registro
1. Usuario completa formulario en `/register`
2. Frontend hace `POST /api/auth/register` con email, password, access_code
3. Backend valida campos requeridos y password.length ≥ 6
4. Verifica que el email no exista (409 si ya registrado)
5. Busca comunidad por access_code (404 si inválido)
6. Hashea password con bcrypt (10 rounds)
7. Inserta usuario con role='residente'
8. Genera JWT con `{ id, email, role }` (7d expiración)
9. Responde 201 con user + token
10. Frontend guarda token + user en localStorage, redirige a /dashboard

### 2.2 Dashboard

#### Frontend
- **Dashboard.jsx**: Selector por rol. Si `user.role === 'admin'` → `<DashboardAdmin />`, sino → `<DashboardResidente />`.
- **DashboardAdmin**: 3 cards (recaudado del mes, morosidad %, tickets pendientes). Umbrales de color: recaudado siempre verde, morosidad >30% rojo / >10% naranja / resto verde, tickets >5 rojo / >0 naranja / 0 verde. CTA: "Crear nueva expensa" → navega a `/expensas`.
- **DashboardResidente**: 2 cards (saldo pendiente, próximo vencimiento) + últimos 2 anuncios. Saldo = 0 → verde + "Al día". Vencimiento pasado → badge rojo "Vencido". CTA: "Pagar expensas" → navega a `/expensas`.

#### Backend API

| Método | Ruta | Auth | Respuesta |
|---|---|---|---|
| GET | `/api/dashboard/residente` | JWT + role=residente | `{ saldo_pendiente, fecha_vencimiento, anuncios[] }` |
| GET | `/api/dashboard/admin` | JWT + role=admin | `{ total_recaudado, porcentaje_morosidad, tickets_pendientes }` |

#### Modelos utilizados
El dashboard usa las tablas **legacy** `expensas` y `pagos` (migración 002), que son independientes de `expenses` y `unit_expenses` (migración 003). Esto crea una inconsistencia: los datos del dashboard no reflejan lo que se crea por el módulo de expensas.

#### Queries del dashboard residente
- **Saldo pendiente:** `SUM(e.amount)` de `expensas` donde `e.id NOT IN (SELECT expensa_id FROM pagos WHERE user_id = $1)`
- **Vencimiento:** primer `due_date` de expensas no pagadas, ordenado ASC
- **Anuncios:** últimos 2 de la tabla `anuncios` (migración 002 legacy, no la tabla `announcements` de 004)

#### Queries del dashboard admin
- **Recaudado:** `SUM(p.amount)` de `pagos` con `paid_at >= primer día del mes actual`
- **Morosidad:** `COUNT(users con expensas no pagadas) / COUNT(total residentes) * 100`
- **Tickets pendientes:** `COUNT(tickets WHERE status = 'pendiente')` (tabla tickets de migración 002 con status 'pendiente', no 'sent' como en 004)

### 2.3 Expensas

#### Frontend
- **Expensas.jsx**: Dos vistas según rol:
  - **ResidentView**: Lista flat de `unit_expenses` con descripción, monto, vencimiento, badge de estado, botón "Pagar" (solo si pending).
  - **AdminView**: Lista de expenses agrupados + modal con tabla de unit_expenses y botón "Confirmar" (solo si in_review).
- **CreateExpensa.jsx**: Formulario colapsable con toggle. Campos: descripción, monto total, vencimiento, período, checkbox "Extraordinaria", upload de factura. Al crear, se muestra feedback: "X unidades, $Y c/u".

#### Backend API

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/expenses` | admin | Crea expense + unit_expenses (prorrateo automático) |
| GET | `/api/expenses` | ambos | Lista expenses con units anidadas |
| GET | `/api/expenses/my` | residente | Lista unit_expenses del usuario |
| GET | `/api/expenses/units` | admin | Todas las unit_expenses de la comunidad (filtro `?status=`) |
| GET | `/api/expenses/:id/units` | admin | Unit expenses de una expensa específica |
| POST | `/api/expenses/:id/upload-file` | admin | Sube factura (PDF/imagen, 5MB max) |
| PUT | `/api/expenses/unit/:id/pay` | residente | Marca como in_review (con archivo de comprobante opcional) |
| PUT | `/api/expenses/unit/:id/confirm` | admin | Marca como paid + confirmed_at |

#### Modelos de datos

**expenses**: `id SERIAL PK`, `community_id FK`, `description`, `amount DECIMAL(10,2)`, `due_date DATE`, `period VARCHAR(20)`, `is_extraordinary BOOLEAN`, `created_by FK`, `file_url VARCHAR(500)`, `created_at`

**unit_expenses**: `id SERIAL PK`, `expense_id FK`, `unit_number VARCHAR(20)`, `amount_owed DECIMAL(10,2)`, `status CHECK('pending','in_review','paid')`, `payment_proof_url`, `paid_at`, `confirmed_at`, `UNIQUE(expense_id, unit_number)`

#### Workflow de pago
1. Residente ve sus expensas en `/expensas`
2. Clic en "Pagar" → `PUT /api/expenses/unit/:id/pay`
3. Backend valida: unit_expense existe, status = 'pending', user.unit_number = unit.unit_number
4. Actualiza status = 'in_review', paid_at = NOW()
5. Admin ve lista en `/expensas`, clic en expensa, modal con tabla
6. Clic en "Confirmar" → `PUT /api/expenses/unit/:id/confirm`
7. Backend valida: unit_expense existe, status ≠ 'paid'
8. Actualiza status = 'paid', confirmed_at = NOW(), paid_at = COALESCE(paid_at, NOW())

### 2.4 Comunicación

#### Frontend

**Anuncios.jsx**:
- Admin: botón "+ Nuevo anuncio" → formulario inline (título + mensaje). Lista todos los anuncios.
- Residente: lista con badge "Nuevo" (is_new === true), opacidad reducida para leídos, botón "Marcar leído".

**Tickets.jsx**:
- Residente: botón "+ Nuevo ticket" → formulario. Lista de mis tickets. Clic → modal con descripción, replies, textarea para responder.
- Admin: lista de todos los tickets con badge de estado. Modal con botones de cambio de estado (Pendiente / En proceso / Resuelto) + replies + responder.

**Layout.jsx (notificaciones)**:
- Campanita en header con badge rojo de no leídas
- Polling cada 30s a `/api/notifications/count`
- Dropdown con lista de notificaciones, botón "Leída" por item, "Marcar todas leídas"
- Items leídos con opacidad reducida

#### Backend API

**Anuncios:**

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/announcements` | admin | Crea anuncio + notifica a todos los residentes |
| GET | `/api/announcements/admin` | admin | Lista todos |
| GET | `/api/announcements` | cualquiera | Lista con campo `is_new` (LEFT JOIN con announcement_reads) |
| PUT | `/api/announcements/:id/read` | cualquiera | Marca como leído (INSERT ON CONFLICT DO NOTHING) |

**Tickets:**

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/api/tickets` | residente | Crea ticket + notifica admins |
| GET | `/api/tickets` | admin | Lista todos con replies anidados |
| GET | `/api/tickets/my` | residente | Mis tickets con replies |
| PUT | `/api/tickets/:id/status` | admin | Cambia status + notifica al creador |
| POST | `/api/tickets/:id/reply` | ambos | Agrega reply. Si admin responde a ticket 'sent' → auto in_progress. Notifica al creador si admin responde. |

**Notificaciones:**

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/api/notifications` | cualquiera | Últimas 50 notificaciones |
| GET | `/api/notifications/count` | cualquiera | Cantidad no leídas |
| PUT | `/api/notifications/:id/read` | cualquiera | Marca una como leída |
| PUT | `/api/notifications/read-all` | cualquiera | Marca todas como leídas |

#### Modelos de datos

**announcements**: `id SERIAL PK`, `community_id FK`, `title`, `message TEXT`, `file_url`, `created_by FK`, `created_at`

**announcement_reads**: `id SERIAL PK`, `announcement_id FK`, `user_id FK`, `read_at`, `UNIQUE(announcement_id, user_id)`

**tickets**: `id SERIAL PK`, `community_id FK`, `user_id FK`, `unit_number`, `title`, `description TEXT`, `file_url`, `status CHECK('sent','in_progress','resolved')`, `created_at`, `updated_at`

**ticket_replies**: `id SERIAL PK`, `ticket_id FK CASCADE`, `message TEXT`, `file_url`, `is_admin BOOLEAN`, `created_at`

**notifications**: `id SERIAL PK`, `user_id FK`, `type VARCHAR(30)`, `title`, `message TEXT`, `reference_id INTEGER`, `is_read BOOLEAN`, `created_at`

#### Workflow de notificaciones
1. Admin crea anuncio → `Notification.createForCommunity()` inserta una notificación por cada usuario de la comunidad (excepto el creador)
2. Admin crea expensa → mismo patrón
3. Residente crea ticket → busca admins de la comunidad, inserta notificación para cada uno
4. Admin cambia estado de ticket → notifica al creador del ticket
5. Admin responde ticket → notifica al creador (si no es el mismo admin)
6. Frontend hace polling cada 30s del count. Al abrir el dropdown, carga las últimas 50.

---

## 3. Business Logic Status

### 3.1 Prorrateo de expensas

**Cálculo:** `parseFloat((parseFloat(amount) / units.length).toFixed(2))`

- Se obtienen todas las unidades distintas (`SELECT DISTINCT unit_number FROM users WHERE community_id = $1 AND unit_number IS NOT NULL AND unit_number != ''`)
- El monto total se divide equitativamente entre todas las unidades
- El flag `is_extraordinary` es meramente informativo — no afecta el cálculo de prorrateo
- No existe el concepto de "monto fijo + extraordinario prorrateado" como dos componentes separados

### 3.2 Máquina de estados (unit_expenses)

```
pending ──(residente paga)──> in_review ──(admin confirma)──> paid
```

- **pending → in_review**: `PUT /unit/:id/pay`. Requiere que el status actual sea 'pending'. El usuario debe pertenecer a la misma unidad. Se registra `paid_at = NOW()`.
- **in_review → paid**: `PUT /unit/:id/confirm`. Requiere que el status NO sea 'paid'. Se registra `confirmed_at = NOW()` y `paid_at = COALESCE(paid_at, NOW())`.
- No hay transición inversa (rollback) desde ningún estado.
- El admin puede confirmar directamente un pago en status 'pending' (sin pasar por in_review). Esto es un bug.

### 3.3 Roles y permisos

- **Roles definidos:** `admin` y `residente` (CHECK constraint en DB).
- **Middleware `authenticate`:** Extrae JWT del header `Authorization: Bearer <token>`, verifica con `jwt.verify()`, inyecta `req.user = { id, email, role, iat, exp }`.
- **Middleware `authorize(...roles)`:** Verifica que `req.user.role` esté en la lista de roles permitidos. Si no → 403.
- **Asignación de rutas:**
  - Públicas: register, login, forgot-password, reset-password
  - Admin-only: create/upload expense, confirm payment, create announcement, list all tickets, update ticket status, dashboard admin
  - Resident-only: my expenses, pay expense, create ticket, my tickets, dashboard resident
  - Ambos: list announcements, reply ticket, notifications

---

## 4. Critical Gaps & Missing Logic

### 4.1 Seguridad

| Gap | Severidad | Descripción |
|---|---|---|
| Sin rate limiting | **Alta** | Los endpoints `/api/auth/login` y `/api/auth/register` no tienen rate limiting. Vulnerables a fuerza bruta. |
| Sin sanitización de input | **Media** | No se sanitiza HTML/scripts en description, message, title. Riesgo de XSS almacenado. |
| CORS abierto | **Baja** | `app.use(cors())` sin configuración de orígenes. En localhost no es problema, en producción debe restringirse. |
| JWT sin refresh token | **Media** | Token expira en 7 días sin mecanismo de renovación. Si se filtra, no hay revocación. |
| uploads público | **Media** | `/uploads` servido estáticamente sin autenticación. Cualquiera puede acceder a archivos subidos si conoce la URL. |
| Sin helmet | **Baja** | No se configuran headers de seguridad HTTP (CSP, X-Frame-Options, etc.). |
| .env sin `.env.example` | **Baja** | No hay template documentado de variables de entorno requeridas. |

### 4.2 Validaciones

| Gap | Severidad | Descripción |
|---|---|---|
| Sin validación de email | **Media** | El email no se valida (formato, dominio). Se acepta cualquier string con @. |
| Sin límites de longitud en inputs | **Media** | No hay maxLength en description, title, message a nivel API ni frontend. |
| unit_number no validado | **Media** | No se verifica que unit_number no esté duplicado en la misma comunidad. Dos usuarios pueden registrarse con la misma unidad. |
| Sin validación de vencimiento | **Baja** | Se puede pagar una expensa con due_date pasado. No hay bloqueo. |
| Sin validación de monto | **Baja** | No se valida que amount sea > 0. Se puede crear una expensa de $0 o negativa. |

### 4.3 Integridad de datos

| Gap | Severidad | Descripción |
|---|---|---|
| Sin transacciones en flujos críticos | **Alta** | `create expense` hace 3 operaciones separadas: INSERT expense + INSERT unit_expenses (batch) + INSERT notificaciones. Si alguna falla, hay inconsistencia. |
| Dashboard legacy vs módulo expensas | **Alta** | El dashboard consulta tablas `expensas`/`pagos` de la migración 002 que NO se pueblan al crear expensas por el módulo (migración 003). Los datos del dashboard están siempre vacíos. |
| Tickets con status 'pendiente' vs 'sent' | **Alta** | La migración 002 creó tickets con status CHECK('pendiente','en_proceso','resuelto'). La 004 los recrea con CHECK('sent','in_progress','resolved'). El dashboard admin filtra por `status = 'pendiente'`, el nuevo módulo usa `'sent'`. El contador de tickets pendientes del dashboard admin siempre da 0. |
| Admin puede confirmar cualquier pago | **Media** | `confirmPayment` no verifica que el admin pertenezca a la misma comunidad que la unit_expense. |
| Sin soft-delete | **Media** | No hay columna `deleted_at`. Cualquier DELETE es físico y en cascada. |

### 4.4 Funcionalidades faltantes

| Gap | Severidad | Descripción |
|---|---|---|
| Sin CRUD completo | **Media** | No hay endpoints para editar o eliminar anuncios, expensas, tickets. Solo crear y leer. |
| Sin paginación | **Media** | Todos los listados devuelven la tabla completa. Con crecimiento de datos, esto es insostenible. |
| Sin filtros avanzados | **Baja** | Solo filtro por status en algunos endpoints. Sin búsqueda por texto, fechas, rango de montos. |
| Sin ordenamiento configurable | **Baja** | El orden es fijo en cada query (ORDER BY created_at DESC). |
| Sin endpoint de perfil | **Baja** | No hay GET/PUT `/api/users/me` para ver o editar datos del perfil. |
| Sin endpoint admin de usuarios | **Baja** | El admin no puede ver, crear, editar o desactivar usuarios de su comunidad. |

### 4.5 Operaciones y DevOps

| Gap | Severidad | Descripción |
|---|---|---|
| Sin tests | **Alta** | Cero tests unitarios, de integración o end-to-end. |
| Sin logging estructurado | **Media** | Solo `console.error()` sin niveles, timestamps, o contexto de request. |
| Sin manejo de migraciones versionado | **Baja** | Las migraciones se ejecutan manualmente con psql. No hay herramienta como Knex, Sequelize o node-pg-migrate. |
| Sin Docker / docker-compose | **Baja** | No hay containerización. El setup requiere PostgreSQL instalado localmente. |
| Sin CI/CD | **Baja** | No hay GitHub Actions ni otro pipeline configurado. |

### 4.6 UX / Frontend

| Gap | Severidad | Descripción |
|---|---|---|
| Sin loading states consistentes | **Baja** | Algunos componentes muestran "Cargando...", otros no tienen indicador visual. |
| Sin feedback de errores de red | **Baja** | Errores de conexión con el backend no se diferencian de errores de validación. |
| Sin skeleton screens | **Baja** | La carga se muestra como texto plano. |
| Sin modo offline | **Baja** | Si el backend no responde, la app queda inutilizable. |
| Register usa fetch en vez de axios | **Baja** | Inconsistencia: Login usa AuthContext (axios), Register usa fetch directo. El interceptor 401 de axios no aplica en Register. |

---

## 5. Diagrama de endpoints completo

```
/api
├── /auth
│   ├── POST /register              [público]
│   ├── POST /login                 [público]
│   ├── POST /forgot-password       [público]
│   └── POST /reset-password/:token [público]
├── /dashboard
│   ├── GET  /residente             [JWT + residente]
│   └── GET  /admin                 [JWT + admin]
├── /expenses
│   ├── POST /                      [JWT + admin]
│   ├── GET  /                      [JWT + ambos]
│   ├── GET  /my                    [JWT + residente]
│   ├── GET  /units                 [JWT + admin]
│   ├── GET  /:id/units             [JWT + admin]
│   ├── POST /:id/upload-file       [JWT + admin]
│   ├── PUT  /unit/:id/pay          [JWT + residente]
│   └── PUT  /unit/:id/confirm      [JWT + admin]
├── /announcements
│   ├── POST /                      [JWT + admin]
│   ├── GET  /admin                 [JWT + admin]
│   ├── GET  /                      [JWT + ambos]
│   └── PUT  /:id/read              [JWT + ambos]
├── /tickets
│   ├── POST /                      [JWT + residente]
│   ├── GET  /                      [JWT + admin]
│   ├── GET  /my                    [JWT + residente]
│   ├── PUT  /:id/status            [JWT + admin]
│   └── POST /:id/reply             [JWT + ambos]
├── /notifications
│   ├── GET  /                      [JWT + ambos]
│   ├── GET  /count                 [JWT + ambos]
│   ├── PUT  /:id/read              [JWT + ambos]
│   └── PUT  /read-all              [JWT + ambos]
└── /health
    └── GET  /                      [público]
```
