# STATE OF THE PROJECT — Comunidad App v1.0

> **Documento técnico para el equipo de desarrollo**  
> **Propósito:** Análisis completo del estado actual para estudio de mejoras, alcance y evolución  
> **Fecha:** Julio 2026

---

## Índice

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura General](#2-arquitectura-general)
3. [Stack Tecnológico](#3-stack-tecnológico)
4. [Estructura del Proyecto](#4-estructura-del-proyecto)
5. [Base de Datos — Esquema Completo](#5-base-de-datos--esquema-completo)
6. [API REST — Catálogo de Endpoints](#6-api-rest--catálogo-de-endpoints)
7. [Modelos y Lógica de Negocio](#7-modelos-y-lógica-de-negocio)
8. [Autenticación y Autorización](#8-autenticación-y-autorización)
9. [Middleware Pipeline](#9-middleware-pipeline)
10. [Frontend — Estructura y Componentes](#10-frontend--estructura-y-componentes)
11. [Integraciones Externas](#11-integraciones-externas)
12. [Jobs Programados (Cron)](#12-jobs-programados-cron)
13. [Configuración y Variables de Entorno](#13-configuración-y-variables-de-entorno)
14. [DevOps, Docker y Deploy](#14-devops-docker-y-deploy)
15. [Seed de Datos de Desarrollo](#15-seed-de-datos-de-desarrollo)
16. [Flujos de Negocio Principales](#16-flujos-de-negocio-principales)
17. [Limitaciones Conocidas y Deuda Técnica](#17-limitaciones-conocidas-y-deuda-técnica)

---

## 1. Resumen Ejecutivo

**Comunidad App** es una plataforma web de gestión de comunidades residenciales (consorcios, barrios cerrados, countries) orientada al mercado latinoamericano. La versión actual (v1.0) es un MVP funcional con los módulos core de administración de propiedades.

### Funcionalidades actuales

| Módulo | Estado | Descripción |
|--------|--------|-------------|
| Autenticación | Funcional | Registro por código de acceso o invitación, login JWT, reset de contraseña |
| Dashboard Admin | Funcional | Recaudación mensual, % morosidad, tickets pendientes |
| Dashboard Residente | Funcional | Saldo pendiente, fecha vencimiento, últimos anuncios |
| Gestión de Expensas | Funcional | Crear con monto fijo + extraordinario, división equitativa, estados pending/in_review/paid, recargos por mora |
| Pagos con MercadoPago | Funcional | Checkout MP, webhook de confirmación automática |
| Anuncios | Funcional | Crear, soft-delete, tracking de lecturas |
| Tickets de mantenimiento | Funcional | Crear residente, estados sent/in_progress/resolved, respuestas con fotos |
| Reserva de Amenities | Funcional | Quincho, SUM, gimnasio; validación de solapamiento, depósito |
| Votaciones | Funcional | Crear encuestas, votación única por usuario |
| Documentos | Funcional | Subir PDFs comunitarios |
| Reportes Excel | Funcional | Morosidad y flujo de caja en XLSX |
| Notificaciones | Funcional | In-app notifications, recordatorios automáticos de vencimiento |
| WhatsApp (Twilio) | Funcional | Notificaciones de expensa nueva y pago confirmado |
| Chat AI (DeepSeek) | Funcional | Asistente contextual con datos del usuario |
| Auditoría | Funcional | Log de acciones admin con IP y JSON |
| Invitaciones | Funcional | Token de 7 días, email de registro |

### Lo que NO tiene (gaps principales)

- **No hay jerarquía geográfica:** `unit_number` es un string libre, no hay complejos, edificios, pisos ni unidades como entidades
- **No hay prorrateo por m²/coeficiente:** Todas las unidades pagan lo mismo
- **No hay multi-tenancy real:** Admin puede cambiar de comunidad vía query param, pero todas las queries dependen de `community_id` directo
- **No hay gestión de proveedores, control de acceso, facturación electrónica ni libro de órdenes**

---

## 2. Arquitectura General

```mermaid
flowchart TD
    subgraph "Cliente"
        BROWSER[Navegador Web]
    end

    subgraph "Frontend (Vite Dev Server :5173)"
        REACT[React 19 SPA]
        ROUTER[React Router 7]
        AXIOS[Axios + Interceptors]
    end

    subgraph "Backend (Express :3000)"
        MIDDLEWARE[Middleware Pipeline]
        AUTH[JWT Auth]
        ROUTES[14 Route Modules]
        CONTROLLERS[15 Controllers]
        MODELS[14 Models]
        JOBS[Cron Jobs]
        SERVICES[WhatsApp Service]
    end

    subgraph "Externo"
        PG[PostgreSQL]
        MP[MercadoPago API]
        TWILIO[Twilio WhatsApp]
        DEEPSEEK[DeepSeek AI]
        EMAIL[Nodemailer SMTP]
    end

    BROWSER -->|Vite Proxy| REACT
    REACT --> AXIOS
    AXIOS -->|"/api/*" → :3000| MIDDLEWARE
    MIDDLEWARE --> ROUTES
    ROUTES --> CONTROLLERS
    CONTROLLERS --> MODELS
    MODELS --> PG
    CONTROLLERS --> MP
    SERVICES --> TWILIO
    CONTROLLERS --> DEEPSEEK
    CONTROLLERS --> EMAIL
    JOBS --> PG
```

### Patrón arquitectónico

El backend sigue un patrón **MVC sin capa de servicios** (los modelos contienen queries SQL directas). No hay ORM: todas las queries son SQL raw ejecutadas a través del pool de `pg`.

### Flujo de una request típica

```
Browser → Vite Proxy → Express
  → helmet (seguridad HTTP headers)
  → cors (cross-origin)
  → express.json() (parse body, 1MB max)
  → globalLimiter (100 req/15min)
  → authenticate (JWT verify)
  → authorize('admin') (role check)
  → setCommunity (resuelve communityId)
  → sanitize (XSS filter)
  → logAudit (registra acción)
  → controller → model → pool.query() → PostgreSQL
```

---

## 3. Stack Tecnológico

### Backend

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| Node.js | 22 (Alpine Docker) | Runtime |
| Express | 4.21.2 | HTTP framework |
| PostgreSQL | (externo) | Base de datos |
| pg | 8.13.1 | Driver PostgreSQL |
| jsonwebtoken | 9.0.2 | JWT auth |
| bcryptjs | 3.0.3 | Password hashing |
| helmet | 8.2.0 | Security headers |
| cors | 2.8.5 | CORS |
| express-rate-limit | 8.5.2 | Rate limiting |
| xss | 1.0.15 | Input sanitization |
| multer | 2.2.0 | File uploads |
| mercadopago | 3.2.0 | MercadoPago SDK |
| twilio | 6.0.2 | WhatsApp messaging |
| nodemailer | 9.0.3 | Email sending |
| node-cron | 4.6.0 | Scheduled jobs |
| exceljs | 4.4.0 | Excel report generation |
| dotenv | 16.4.7 | Environment config |
| nodemon | 3.1.9 | Dev auto-reload |

### Frontend

| Tecnología | Versión | Propósito |
|-----------|---------|-----------|
| React | 19.0.0 | UI library |
| Vite | 6.0.11 | Build tool & dev server |
| React Router | 7.1.3 | Client-side routing |
| Axios | 1.7.9 | HTTP client |
| Moment | 2.30.1 | Date formatting |
| react-big-calendar | 1.20.0 | Calendar (amenities) |

### Infraestructura

| Herramienta | Propósito |
|------------|-----------|
| Docker (Alpine) | Containerización |
| docker-compose | Orquestación local |
| concurrently | Dev monorepo runner |
| pg_isready | Health check en entrypoint |

---

## 4. Estructura del Proyecto

```
comunidad-app/
├── package.json                    # Root: scripts dev, db:migrate, db:seed
├── AGENTS.md                       # Project conventions
├── PROFESSIONAL_ROADMAP.md         # Roadmap de evolución (análisis futuro)
├── STATE_OF_THE_PROJECT.md         # Este documento
│
├── src/
│   ├── backend/
│   │   ├── package.json
│   │   ├── Dockerfile
│   │   ├── entrypoint.sh           # Espera PG + ejecuta migraciones + seed opcional
│   │   ├── .env                    # Configuración (no commiteada)
│   │   ├── server.js               # Entry point: middleware + routes + cron
│   │   ├── db.js                   # Pool de PostgreSQL (pg)
│   │   ├── seed.js                 # Datos de desarrollo
│   │   │
│   │   ├── controllers/            # 15 archivos
│   │   │   ├── authController.js
│   │   │   ├── expenseController.js
│   │   │   ├── ticketController.js
│   │   │   ├── announcementController.js
│   │   │   ├── dashboardController.js
│   │   │   ├── paymentController.js
│   │   │   ├── notificationController.js
│   │   │   ├── userController.js
│   │   │   ├── adminController.js
│   │   │   ├── reportsController.js
│   │   │   ├── bookingController.js
│   │   │   ├── chatController.js
│   │   │   ├── pollsController.js
│   │   │   ├── documentsController.js
│   │   │   └── auditController.js
│   │   │
│   │   ├── models/                 # 14 archivos
│   │   │   ├── User.js
│   │   │   ├── Expense.js
│   │   │   ├── Ticket.js
│   │   │   ├── Announcement.js
│   │   │   ├── Dashboard.js
│   │   │   ├── Notification.js
│   │   │   ├── Invite.js
│   │   │   ├── Poll.js
│   │   │   ├── Report.js
│   │   │   ├── Audit.js
│   │   │   ├── PaymentTransaction.js
│   │   │   ├── Booking.js
│   │   │   ├── ChatContext.js
│   │   │   └── Document.js
│   │   │
│   │   ├── routes/                 # 16 archivos (1 por módulo)
│   │   │   ├── auth.js
│   │   │   ├── expenses.js
│   │   │   ├── tickets.js
│   │   │   ├── announcements.js
│   │   │   ├── dashboard.js
│   │   │   ├── payments.js
│   │   │   ├── notifications.js
│   │   │   ├── users.js
│   │   │   ├── admin.js
│   │   │   ├── reports.js
│   │   │   ├── bookings.js
│   │   │   ├── chat.js
│   │   │   ├── polls.js
│   │   │   ├── documents.js
│   │   │   ├── webhooks.js
│   │   │   └── phone.js
│   │   │
│   │   ├── middleware/             # 7 archivos
│   │   │   ├── auth.js             # JWT verify → req.user
│   │   │   ├── authorize.js        # Role check → 403
│   │   │   ├── setCommunity.js     # Resuelve req.communityId
│   │   │   ├── sanitize.js         # XSS filter en req.body
│   │   │   ├── rateLimiter.js      # Global + auth limiters
│   │   │   ├── logAudit.js         # Intercept res.json → audit_log
│   │   │   └── uploadsAuth.js      # JWT para archivos estáticos
│   │   │
│   │   ├── jobs/
│   │   │   └── reminders.js        # Cron: recordatorios de vencimiento
│   │   │
│   │   ├── services/
│   │   │   └── whatsapp.js         # Twilio WhatsApp client
│   │   │
│   │   ├── migrations/             # 12 archivos SQL secuenciales
│   │   │   ├── 001_initial.sql
│   │   │   ├── 002_dashboard.sql
│   │   │   ├── 003_expenses.sql
│   │   │   ├── 004_comunicacion.sql
│   │   │   ├── 005_expense_split.sql
│   │   │   ├── 006_soft_delete.sql
│   │   │   ├── 007_invites.sql
│   │   │   ├── 008_late_fees.sql
│   │   │   ├── 009_audit_logs.sql
│   │   │   ├── 010_payment_transactions.sql
│   │   │   ├── 011_amenities.sql
│   │   │   └── 012_user_type_polls.sql
│   │   │
│   │   └── uploads/                # Archivos subidos (no commiteados)
│   │
│   └── frontend/
│       ├── package.json
│       ├── vite.config.js          # Proxy /api → :3000, /uploads → :3000
│       ├── Dockerfile              # Multi-stage build → nginx:alpine
│       ├── index.html
│       └── src/
│           ├── App.jsx             # Router + Providers
│           ├── main.jsx            # ReactDOM.createRoot
│           ├── context/
│           │   ├── AuthContext.jsx      # user state, login/logout, localStorage
│           │   └── CommunityContext.jsx  # Admin multi-community selector
│           ├── components/
│           │   ├── Layout.jsx           # Nav, notifications, chat, WhatsApp
│           │   ├── ProtectedRoute.jsx    # Redirect to /login if no user
│           │   ├── ChatWidget.jsx        # DeepSeek AI assistant
│           │   ├── WhatsAppButton.jsx    # Floating button
│           │   ├── Spinner.jsx
│           │   └── PollsWidget.jsx
│           ├── pages/
│           │   ├── Login.jsx
│           │   ├── Register.jsx
│           │   ├── Dashboard.jsx
│           │   ├── Expensas.jsx
│           │   ├── Anuncios.jsx
│           │   ├── Tickets.jsx
│           │   ├── InviteResidente.jsx
│           │   ├── Audit.jsx
│           │   ├── Amenities.jsx
│           │   └── Documents.jsx
│           └── services/
│               ├── api.js               # Axios instance + interceptors
│               ├── expensas.js
│               ├── comunicacion.js       # Announcements + tickets + notifications
│               ├── payments.js
│               ├── bookings.js
│               ├── chat.js
│               └── errors.js
```

---

## 5. Base de Datos — Esquema Completo

### 5.1 Diagrama Entidad-Relación

```mermaid
erDiagram
    communities ||--o{ users : "pertenece"
    communities ||--o{ expenses : "tiene"
    communities ||--o{ announcements : "tiene"
    communities ||--o{ tickets : "tiene"
    communities ||--o{ polls : "tiene"
    communities ||--o{ documents : "tiene"
    communities ||--o{ amenities : "tiene"
    communities ||--o{ invites : "tiene"

    users ||--o{ expenses : "created_by"
    users ||--o{ announcements : "created_by"
    users ||--o{ tickets : "crea"
    users ||--o{ notifications : "recibe"
    users ||--o{ poll_votes : "vota"
    users ||--o{ bookings : "reserva"
    users ||--o{ invites : "created_by"

    expenses ||--o{ unit_expenses : "desglose por unidad"
    expenses ||--o{ payment_transactions : "pagos"

    tickets ||--o{ ticket_replies : "respuestas"
    amenities ||--o{ bookings : "reservas"
    polls ||--o{ poll_votes : "votos"
    announcements ||--o{ announcement_reads : "lecturas"

    unit_expenses ||--o{ payment_transactions : "transaccion"
```

### 5.2 Tabla `communities`

```sql
CREATE TABLE communities (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    address     VARCHAR(255),
    access_code VARCHAR(50) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT NOW()
);
```

**Rol:** Entidad raíz del sistema. Todo pertenece a una comunidad.  
**Acceso:** El `access_code` es el mecanismo de registro público (legacy). Las invitaciones lo reemplazan para multi-tenant.

### 5.3 Tabla `users`

```sql
CREATE TABLE users (
    id                   SERIAL PRIMARY KEY,
    email                VARCHAR(255) UNIQUE NOT NULL,
    password_hash        VARCHAR(255) NOT NULL,
    role                 VARCHAR(20) NOT NULL DEFAULT 'residente'
                         CHECK (role IN ('admin', 'residente')),
    unit_number          VARCHAR(20),
    community_id         INTEGER REFERENCES communities(id) ON DELETE SET NULL,
    reset_token          VARCHAR(255),
    reset_token_expires  TIMESTAMP,
    user_type            VARCHAR(10) DEFAULT 'owner'
                         CHECK (user_type IN ('owner', 'tenant')),
    phone                VARCHAR(30),
    created_at           TIMESTAMP DEFAULT NOW()
);
```

**Roles:**
- `admin`: Crea expensas, anuncios, confirma pagos, invita residentes, ve auditoría
- `residente`: Ve sus expensas, crea tickets, vota, reserva amenities

**Tipos de usuario:**
- `owner`: Propietario. Único que puede votar en polls.
- `tenant`: Inquilino. Puede pagar expensas y crear tickets pero no vota.

### 5.4 Tabla `expenses`

```sql
CREATE TABLE expenses (
    id                SERIAL PRIMARY KEY,
    community_id      INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    description       VARCHAR(255) NOT NULL,
    amount            DECIMAL(10,2) NOT NULL,       -- Total = fixed + extra
    due_date          DATE NOT NULL,
    period            VARCHAR(20),                  -- Ej: "2026-07"
    is_extraordinary  BOOLEAN DEFAULT FALSE,
    created_by        INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    file_url          VARCHAR(500),
    fixed_amount      DECIMAL(10,2),               -- Monto fijo (servicios)
    extra_amount      DECIMAL(10,2) DEFAULT 0,     -- Monto extraordinario
    deleted_at        TIMESTAMP,                    -- Soft delete
    late_fee_percent  DECIMAL(5,2) DEFAULT 0,      -- % recargo por mora
    grace_days        INTEGER DEFAULT 5,           -- Días de gracia
    created_at        TIMESTAMP DEFAULT NOW()
);
```

### 5.5 Tabla `unit_expenses`

```sql
CREATE TABLE unit_expenses (
    id                 SERIAL PRIMARY KEY,
    expense_id         INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    unit_number        VARCHAR(20) NOT NULL,
    amount_owed        DECIMAL(10,2) NOT NULL,
    status             VARCHAR(20) NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'in_review', 'paid')),
    payment_proof_url  VARCHAR(500),
    paid_at            TIMESTAMP,
    confirmed_at       TIMESTAMP,
    fixed_part         DECIMAL(10,2),
    extra_part         DECIMAL(10,2) DEFAULT 0,
    UNIQUE(expense_id, unit_number)
);
```

**Máquina de estados:**
```
pending → in_review (residente sube comprobante O crea preferencia MP)
in_review → paid (admin confirma O webhook MP aprueba)
pending → paid (admin confirma directamente)
```

### 5.6 Tablas de comunicación

#### `announcements`
```sql
CREATE TABLE announcements (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    message      TEXT NOT NULL,
    file_url     VARCHAR(500),
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

#### `announcement_reads`
```sql
CREATE TABLE announcement_reads (
    id              SERIAL PRIMARY KEY,
    announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at         TIMESTAMP DEFAULT NOW(),
    UNIQUE(announcement_id, user_id)
);
```

#### `tickets`
```sql
CREATE TABLE tickets (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_number  VARCHAR(20) NOT NULL,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    file_url     VARCHAR(500),
    status       VARCHAR(20) NOT NULL DEFAULT 'sent'
                 CHECK (status IN ('sent', 'in_progress', 'resolved')),
    deleted_at   TIMESTAMP,
    created_at   TIMESTAMP DEFAULT NOW(),
    updated_at   TIMESTAMP DEFAULT NOW()
);
```

**Máquina de estados de tickets:**
```
sent → in_progress (admin responde)
in_progress → resolved (admin marca resuelto)
```

Regla de negocio: Si admin responde un ticket en estado `sent`, se auto-transiciona a `in_progress`.

#### `ticket_replies`
```sql
CREATE TABLE ticket_replies (
    id        SERIAL PRIMARY KEY,
    ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    message   TEXT NOT NULL,
    file_url  VARCHAR(500),
    is_admin  BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 5.7 Tablas de soporte

#### `notifications`
```sql
CREATE TABLE notifications (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type         VARCHAR(30) NOT NULL,
    title        VARCHAR(255) NOT NULL,
    message      TEXT,
    reference_id INTEGER,
    is_read      BOOLEAN DEFAULT FALSE,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

#### `invites`
```sql
CREATE TABLE invites (
    id           SERIAL PRIMARY KEY,
    email        VARCHAR(255) NOT NULL,
    community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    unit_number  VARCHAR(20) NOT NULL,
    token        VARCHAR(64) UNIQUE NOT NULL,
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used         BOOLEAN DEFAULT FALSE,
    expires_at   TIMESTAMP NOT NULL,       -- 7 días desde creación
    created_at   TIMESTAMP DEFAULT NOW()
);
```

#### `audit_logs`
```sql
CREATE TABLE audit_logs (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action     VARCHAR(50) NOT NULL,
    details    JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);
-- Índices: idx_audit_user, idx_audit_action, idx_audit_created
```

#### `payment_transactions`
```sql
CREATE TABLE payment_transactions (
    id                  SERIAL PRIMARY KEY,
    unit_expense_id     INTEGER NOT NULL REFERENCES unit_expenses(id) ON DELETE CASCADE,
    preference_id       VARCHAR(100) UNIQUE NOT NULL,
    payment_id          VARCHAR(100),
    status              VARCHAR(30) NOT NULL DEFAULT 'pending',
    external_reference  VARCHAR(100),
    fee_amount          DECIMAL(10,2) DEFAULT 0,
    mercadopago_response JSONB DEFAULT '{}',
    created_at          TIMESTAMP DEFAULT NOW(),
    updated_at          TIMESTAMP DEFAULT NOW()
);
```

### 5.8 Tablas de amenities

#### `amenities`
```sql
CREATE TABLE amenities (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    name         VARCHAR(100) NOT NULL,
    description  TEXT,
    capacity     INTEGER DEFAULT 1,
    rules        JSONB DEFAULT '{}',
    created_at   TIMESTAMP DEFAULT NOW()
);
```

#### `bookings`
```sql
CREATE TABLE bookings (
    id              SERIAL PRIMARY KEY,
    amenity_id      INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
    user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    unit_number     VARCHAR(20) NOT NULL,
    date_from       TIMESTAMP NOT NULL,
    date_to         TIMESTAMP NOT NULL,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
    deposit_amount  DECIMAL(10,2) DEFAULT 0,
    notes           TEXT,
    created_at      TIMESTAMP DEFAULT NOW(),
    updated_at      TIMESTAMP DEFAULT NOW()
);
-- Índices: idx_bookings_amenity, idx_bookings_status, idx_bookings_dates
```

### 5.9 Tablas de participación

#### `polls`
```sql
CREATE TABLE polls (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    options      JSONB NOT NULL DEFAULT '[]',
    created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    expires_at   TIMESTAMP,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

#### `poll_votes`
```sql
CREATE TABLE poll_votes (
    id           SERIAL PRIMARY KEY,
    poll_id      INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    option_index INTEGER NOT NULL,
    created_at   TIMESTAMP DEFAULT NOW(),
    UNIQUE(poll_id, user_id)
);
```

#### `documents`
```sql
CREATE TABLE documents (
    id           SERIAL PRIMARY KEY,
    community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    title        VARCHAR(255) NOT NULL,
    description  TEXT,
    file_url     VARCHAR(500) NOT NULL,
    uploaded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMP DEFAULT NOW()
);
```

### 5.10 Tablas legacy (no usadas por la app actual)

Existen dos tablas creadas en `002_dashboard.sql` que fueron reemplazadas:

```sql
-- LEGACY: No usar. Reemplazadas por expenses + unit_expenses
CREATE TABLE expensas (id SERIAL, community_id INTEGER, description VARCHAR, amount DECIMAL, due_date DATE, created_at TIMESTAMP);
CREATE TABLE pagos (id SERIAL, user_id INTEGER, expensa_id INTEGER, amount DECIMAL, paid_at TIMESTAMP, confirmed_by INTEGER);
```

---

## 6. API REST — Catálogo de Endpoints

### 6.1 Convenciones

- **Autenticación:** `Authorization: Bearer <JWT>`
- **Admin multi-comunidad:** `?community=<id>` (solo admin, vía `setCommunity`)
- **Formato de respuesta:** JSON. Errores: `{ error: "mensaje" }`
- **Paginación:** `?page=1&limit=10` donde aplica. Respuesta: `{ data, total, page, totalPages }`
- **Sanitización:** Campos string del body pasan por XSS filter automáticamente en rutas que usan `sanitize()`

### 6.2 Catálogo completo

#### Auth — `/api/auth`

| Método | Ruta | Auth | Rate Limit | Descripción |
|--------|------|------|------------|-------------|
| POST | `/register` | No | 5/15min | Registro con access_code o inviteToken |
| POST | `/login` | No | 5/15min | Login → JWT + user |
| POST | `/forgot-password` | No | 5/15min | Envía email con reset token (1h expiry) |
| POST | `/reset-password/:token` | No | - | Nueva contraseña |

**POST /register body:**
```json
{
  "email": "vecino@mail.com",
  "password": "123456",
  "access_code": "DEMO2024",       // legacy
  "inviteToken": "abc123...",      // preferido
  "unit_number": "5A",
  "user_type": "owner"             // "owner" | "tenant"
}
```

#### Dashboard — `/api/dashboard`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/residente` | Resident | authenticate, setCommunity, authorize('residente') |
| GET | `/admin` | Admin | authenticate, authorize('admin'), setCommunity |

**GET /residente response:**
```json
{
  "saldo_pendiente": 35000.00,
  "fecha_vencimiento": "2026-07-10",
  "anuncios": [{ "title": "...", "content": "...", "created_at": "..." }]
}
```

**GET /admin response:**
```json
{
  "total_recaudado": 150000.00,
  "porcentaje_morosidad": 25,
  "tickets_pendientes": 3
}
```

#### Expensas — `/api/expenses`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/` | Admin | authenticate, authorize('admin'), setCommunity, sanitize, logAudit('CREATE_EXPENSE') |
| PUT | `/:id` | Admin | authenticate, authorize('admin'), setCommunity, sanitize, logAudit('UPDATE_EXPENSE') |
| POST | `/:id/upload-file` | Admin | authenticate, authorize('admin'), setCommunity, upload.single('file') |
| GET | `/units` | Admin | authenticate, authorize('admin'), setCommunity |
| GET | `/:id/units` | Admin | authenticate, authorize('admin'), setCommunity |
| PUT | `/unit/:unitExpenseId/confirm` | Admin | authenticate, authorize('admin'), setCommunity, logAudit('CONFIRM_PAYMENT') |
| GET | `/my` | Resident | authenticate, authorize('residente'), setCommunity |
| GET | `/` | Any | authenticate, setCommunity |
| PUT | `/unit/:unitExpenseId/pay` | Resident | authenticate, authorize('residente') |

**POST / create body:**
```json
{
  "description": "Expensa Julio 2026",
  "fixedAmount": 20000,
  "extraAmount": 5000,
  "due_date": "2026-07-10",
  "period": "2026-07"
}
```

**Lógica de prorrateo:** `fixedPerUnit = fixedAmount / count(units)`. División equitativa, sin ponderación por m².

**GET /my (residente):** Calcula late_fee y is_overdue en base a `grace_days` y `late_fee_percent`. Si hoy > due_date + grace_days, y status != paid, se aplica recargo.

#### Tickets — `/api/tickets`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/` | Resident | authenticate, authorize('residente'), setCommunity, sanitize, upload.single('file') |
| GET | `/` | Admin | authenticate, authorize('admin'), setCommunity |
| GET | `/my` | Resident | authenticate, authorize('residente') |
| PUT | `/:id/status` | Admin | authenticate, authorize('admin'), setCommunity, logAudit('UPDATE_TICKET_STATUS') |
| PUT | `/:id` | Any | authenticate, sanitize |
| POST | `/:id/reply` | Any | authenticate, sanitize, upload.single('file') |

**Estados:** `sent`, `in_progress`, `resolved`  
**Solo editables en estado `sent`**

#### Anuncios — `/api/announcements`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/` | Admin | authenticate, authorize('admin'), setCommunity, sanitize, logAudit('CREATE_ANNOUNCEMENT'), upload.single('file') |
| GET | `/admin` | Admin | authenticate, authorize('admin'), setCommunity |
| GET | `/` | Any | authenticate, setCommunity |
| PUT | `/:id/read` | Any | authenticate |
| DELETE | `/:id` | Admin | authenticate, authorize('admin'), setCommunity, logAudit('DELETE_ANNOUNCEMENT') |

**GET / (residente):** Usa `LEFT JOIN announcement_reads` para calcular campo `is_new`. Retorna anuncios con indicador de no leídos.

#### Notificaciones — `/api/notifications`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/` | Any | authenticate |
| GET | `/count` | Any | authenticate |
| PUT | `/:id/read` | Any | authenticate |
| PUT | `/read-all` | Any | authenticate |

#### Admin — `/api/admin`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/invite` | Admin | authenticate, authorize('admin'), setCommunity |
| GET | `/communities` | Admin | authenticate, authorize('admin') |
| GET | `/audit` | Admin | authenticate, authorize('admin'), setCommunity |

**POST /invite body:**
```json
{
  "email": "nuevo@vecino.com",
  "unit_number": "5B"
}
```
Crea token de 64 chars hex, expira en 7 días, envía email.

#### Pagos — `/api/payments`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/create-preference` | Any | authenticate |

**Body:** `{ "unitExpenseId": 42 }`  
Crea preferencia de MercadoPago. Retorna `{ init_point, preference_id, sandbox_init_point }`.

#### Webhooks — `/api/webhooks`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/mercadopago` | No (MP envía) | - |

Procesa `payment.created`. Si `status === 'approved'`, confirma la unit_expense automáticamente y notifica al usuario.

#### Reportes — `/api/reports`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/delinquency` | Admin | authenticate, authorize('admin'), setCommunity |
| GET | `/cashflow` | Admin | authenticate, authorize('admin'), setCommunity |

Generan archivos Excel (`.xlsx`) con `exceljs`.  
**Query params:** `?month=2026-07`

#### Amenities — `/api/bookings`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/amenities` | Any | authenticate, setCommunity |
| GET | `/my` | Any | authenticate |
| GET | `/` | Admin | authenticate, authorize('admin'), setCommunity |
| POST | `/` | Resident | authenticate, authorize('residente'), setCommunity |
| PUT | `/:id/status` | Admin | authenticate, authorize('admin'), setCommunity |

**POST / body:**
```json
{
  "amenity_id": 1,
  "date_from": "2026-07-15T18:00:00Z",
  "date_to": "2026-07-15T22:00:00Z",
  "deposit_amount": 5000,
  "notes": "Cumpleaños"
}
```
Valida solapamiento con `findOverlapping()` antes de crear.

#### Chat AI — `/api/chat`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/query` | Any | authenticate |

**Body:** `{ "message": "¿Cuánto debo de expensas?" }`  
Usa DeepSeek API (`deepseek-chat` model) con contexto enriquecido del usuario (saldo, expensas pendientes, anuncios no leídos). Mantiene historial en memoria (Map, max 20 mensajes por userId).

#### Encuestas — `/api/polls`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/` | Admin | authenticate, authorize('admin'), setCommunity |
| GET | `/` | Any | authenticate, setCommunity |
| POST | `/:id/vote` | Any | authenticate, setCommunity |

**Solo `user_type = 'owner'` puede votar.** Un voto por usuario por encuesta (UNIQUE).

#### Documentos — `/api/documents`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| POST | `/` | Admin | authenticate, authorize('admin'), setCommunity, upload.single('file') |
| GET | `/` | Any | authenticate, setCommunity |

**Solo PDF.** Límite 10MB.

#### Usuarios — `/api/users`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/me` | Any | authenticate |
| PUT | `/me` | Any | authenticate |

#### Teléfono Admin — `/api/admin/phone`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/admin/phone` | Any | authenticate |

#### Health — `/api/health`

| Método | Ruta | Auth | Middleware |
|--------|------|------|------------|
| GET | `/health` | No | - |

---

## 7. Modelos y Lógica de Negocio

### 7.1 Capa de modelos

Cada archivo en `src/backend/models/` exporta un objeto con métodos estáticos que ejecutan queries SQL directas. No hay herencia ni ORM.

**Helper `getQuery(client)`:**
```js
function getQuery(client) {
  return client || pool;
}
```
Permite que los métodos acepten un `client` opcional (transacción). Si no se pasa, usan el `pool` global.

### 7.2 User.js (`models/User.js`)

| Método | Query | Notas |
|--------|-------|-------|
| `findByEmail(email)` | `SELECT * FROM users WHERE email = $1` | Incluye password_hash |
| `findById(id)` | `SELECT ...` excluyendo password_hash, reset_token | Perfil seguro |
| `create({...})` | `INSERT INTO users ... RETURNING *` | user_type default 'owner' |
| `setResetToken(email, token, expires)` | `UPDATE users SET reset_token = $2, reset_token_expires = $3 WHERE email = $1` | |
| `findByResetToken(token)` | `SELECT * FROM users WHERE reset_token = $1 AND reset_token_expires > NOW()` | |
| `updatePassword(id, hash)` | `UPDATE ... SET password_hash = $2, reset_token = NULL, reset_token_expires = NULL` | |
| `updateProfile(id, {...})` | `UPDATE ... SET` dinámico | email, unit_number |
| `Community.findByAccessCode(code)` | `SELECT * FROM communities WHERE access_code = $1` | |

### 7.3 Expense.js (`models/Expense.js`)

| Método | Descripción |
|--------|-------------|
| `create({...}, client)` | INSERT en expenses. `amount = fixed + extra`. Soporta transacción |
| `findById(id)` | Con `deleted_at IS NULL` |
| `findByCommunity(id, {page, limit, status})` | Paginado, JOIN con users para created_by_email |
| `update(id, {...})` | UPDATE dinámico |
| `deleteUnitExpenses(id, client)` | DELETE todas las unit_expenses de una expense |
| `softDelete(id)` | SET deleted_at = NOW() |
| `updateFile(id, url)` | SET file_url |
| `getDistinctUnits(communityId, client)` | SELECT DISTINCT unit_number FROM users WHERE unit_number IS NOT NULL |
| `createUnitExpenses(id, units[], client)` | Bulk INSERT |
| `findUnitExpenses(id, {status})` | Lista unit_expenses de una expense |
| `findMyUnitExpenses(unit_number, communityId)` | JOIN expenses + unit_expenses |
| `findUnitExpenseById(id)` | JOIN con expenses |
| `updateUnitStatus(id, status, proof_url)` | SET status, paid_at si in_review |
| `confirmUnitExpense(id)` | SET status='paid', confirmed_at=NOW() |
| `findUnitExpenseWithCommunity(id)` | Incluye expense_community_id |
| `findDueSoon(daysFromNow)` | Expensas que vencen en N días, JOIN users por unit_number |
| `findOverdue()` | Expensas que vencieron ayer, JOIN users por unit_number |

**IMPORTANTE:** `getDistinctUnits` obtiene las unidades de la tabla `users`, no de una tabla de unidades. Esto es una limitación: si una unidad no tiene usuario asignado, no recibe expensa.

### 7.4 Dashboard.js (`models/Dashboard.js`)

**residente(userId):**
1. Obtiene `unit_number` y `community_id` del usuario
2. SUM de `amount_owed` de unit_expenses pending/in_review → `saldo_pendiente`
3. MIN `due_date` de unit_expenses pending → `fecha_vencimiento`
4. Últimos 2 anuncios de la comunidad

**admin(userId):**
1. SUM de `amount_owed` de unit_expenses `paid` confirmadas este mes → `total_recaudado`
2. COUNT DISTINCT unit_number deudoras / COUNT residentes × 100 → `porcentaje_morosidad`
3. COUNT tickets sent + in_progress → `tickets_pendientes`

### 7.5 Notification.js (`models/Notification.js`)

| Método | Descripción |
|--------|-------------|
| `create({...}, client)` | INSERT notificación individual |
| `createForCommunity(communityId, {...}, client)` | Crea notificación para TODOS los usuarios de la comunidad (excepto excludeUserId). Itera con un loop — no usa INSERT masivo |
| `findByUser(userId)` | Últimas 50, orden DESC |
| `countUnread(userId)` | COUNT WHERE is_read = FALSE |
| `markAsRead(id, userId)` | UPDATE único |
| `markAllAsRead(userId)` | UPDATE masivo |

**IMPORTANTE:** `createForCommunity` hace N INSERTs secuenciales (uno por usuario). Con 10,000 usuarios esto sería muy lento. Debería usar `INSERT INTO ... SELECT ...` masivo.

### 7.6 ChatContext.js (`models/ChatContext.js`)

Construye un objeto de contexto enriquecido para el sistema de chat AI:

```json
{
  "usuario": { "email": "...", "rol": "...", "tipo": "owner", "unidad": "5A" },
  "saldo_pendiente": 35000.00,
  "pendientes_count": 2,
  "ultima_expensa_pagada": { "monto": 25000, "fecha": "2026-06-10" },
  "anuncios_no_leidos": ["Mantenimiento de ascensores"],
  "amenities": [{ "nombre": "Quincho", "capacidad": 20 }],
  "proximas_expensas": [{ "descripcion": "...", "monto": "...", "vence": "..." }],
  "payment_unit_ids": [42, 43]
}
```

### 7.7 Otros modelos

| Modelo | Funciones clave |
|--------|----------------|
| `Ticket.js` | CRUD tickets, replies, findByCommunity paginado con filtro status |
| `Announcement.js` | CRUD, soft delete, tracking de lecturas (LEFT JOIN announcement_reads) |
| `Invite.js` | create (token 64-char hex, 7 días), findByToken, markUsed |
| `Poll.js` | create (options JSONB), list con vote count, vote (UNIQUE user+poll) |
| `Report.js` | delinquency (XLSX con columnas: Unidad, Propietario, Total Adeudado, Días de Mora, Estado), cashflow (ingresos/egresos/saldo) |
| `Audit.js` | log (JSONB), findByCommunity con filtros action/from/to |
| `PaymentTransaction.js` | create, findByPreferenceId, updateStatus (guarda MP response completa) |
| `Booking.js` | findOverlapping, create, findByCommunity, updateStatus |
| `Document.js` | create, findByCommunity |

---

## 8. Autenticación y Autorización

### 8.1 Flujo de registro

```
Registro por código de acceso (legacy):
  POST /api/auth/register { email, password, access_code, unit_number }
  → Busca community por access_code
  → Crea user con role='residente'
  → Retorna JWT

Registro por invitación (profesional):
  Admin crea invite → email enviado con link que contiene token
  POST /api/auth/register { email, password, inviteToken }
  → Busca invite por token (debe ser mismo email, no expirado, no usado)
  → Asigna community_id y unit_number del invite
  → Marca invite como usado
  → Retorna JWT
```

### 8.2 JWT

```js
jwt.sign(
  { id: user.id, email: user.email, role: user.role },
  process.env.JWT_SECRET,
  { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
)
```

El payload incluye `community_id` solo si el usuario fue cargado desde DB (en authController.register/login se incluye el objeto user completo, que contiene community_id).

### 8.3 Middleware de autorización

```js
// middleware/auth.js — authenticate
const decoded = jwt.verify(token, process.env.JWT_SECRET);
req.user = decoded;  // { id, email, role }

// middleware/authorize.js — authorize('admin')
if (!roles.includes(req.user.role)) return 403;

// middleware/setCommunity.js — setCommunity
if (req.query.community && req.user.role === 'admin') {
    req.communityId = parseInt(req.query.community);  // Admin multi-comunidad
} else if (req.user.community_id) {
    req.communityId = req.user.community_id;           // Del JWT
} else {
    // Fallback: buscar en DB
    const user = await User.findById(req.user.id);
    req.communityId = user.community_id;
}
```

**IMPORTANTE:** La funcionalidad multi-comunidad para admin funciona vía `?community=X` query param. El `setCommunity` middleware permite que un admin cambie de comunidad sobre la marcha. Sin embargo, el JWT en sí solo contiene una comunidad (la asignada al usuario).

---

## 9. Middleware Pipeline

### Orden de ejecución en `server.js`

```
1. helmet()                    → Security headers HTTP
2. cors()                      → Cross-Origin Resource Sharing (abierto)
3. express.json({ limit: 1mb }) → Body parser
4. globalLimiter               → 100 req / 15 min por IP
5. [rutas]                     → static /uploads con JWT auth
6. [rutas api]                 → cada ruta aplica su propia cadena
```

### Cadena típica por ruta

```
authenticate → authorize('admin') → setCommunity → sanitize('field1', 'field2') → logAudit('ACTION') → controller
```

### Rate Limiting

| Limiter | Ventana | Max | Aplica a |
|---------|---------|-----|----------|
| `globalLimiter` | 15 min | 100 | Todas las rutas |
| `authLimiter` | 15 min | 5 | Solo /auth/*, saltea éxitos |

### Sanitización (XSS)

```js
// middleware/sanitize.js
const xss = require('xss');
module.exports = (...fields) => (req, res, next) => {
    for (const field of fields) {
        if (req.body[field] && typeof req.body[field] === 'string') {
            req.body[field] = xss(req.body[field]);
        }
    }
    next();
};
```

### Auditoría

```js
// middleware/logAudit.js
// Intercepta res.json() para loggear después de que la respuesta es exitosa
function logAudit(action, getDetails = null) {
  return (req, res, next) => {
    const originalSend = res.json.bind(res);
    res.json = function (body) {
      Audit.log({
        user_id: req.user?.id,
        action,
        details: getDetails ? getDetails(req, body) : {},
        ip_address: req.ip
      }).catch(err => console.error(err));
      return originalSend(body);
    };
    next();
  };
}
```

### Archivos estáticos protegidos

`/uploads` requiere autenticación JWT (vía query `?token=` o header `Authorization: Bearer`). Implementado en `middleware/uploadsAuth.js`.

---

## 10. Frontend — Estructura y Componentes

### 10.1 Arquitectura

- **SPA con React Router 7**: Rutas del lado cliente, sin SSR
- **Sin state management library**: Solo Context API (AuthContext, CommunityContext)
- **Sin librería de componentes UI**: Todo CSS inline (objetos `styles` en cada componente)
- **Vite proxy**: `/api` → `localhost:3000`, `/uploads` → `localhost:3000`

### 10.2 Providers (Context)

```
<AuthProvider>
  <CommunityProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" />
        <Route path="/register" />
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/dashboard" />
          <Route path="/expensas" />
          ...
        </Route>
      </Routes>
    </BrowserRouter>
  </CommunityProvider>
</AuthProvider>
```

**AuthContext:**
- Estado: `user` (desde localStorage), `loading`
- Métodos: `login(email, password)`, `logout()`
- Persistencia: `localStorage.setItem('token', ...)`, `localStorage.setItem('user', JSON.stringify(...))`

**CommunityContext:**
- Estado: `communities[]`, `selectedId`
- Fetch: `GET /api/admin/communities`
- Usado solo por admin para el selector de comunidad
- Persiste `selectedId` en localStorage

### 10.3 Axios Interceptors

```js
// Request interceptor:
// 1. Agrega header Authorization: Bearer <token>
// 2. Si el user es admin, agrega ?community=<selectedId> a todos los requests

// Response interceptor:
// Si recibe 401 → limpia localStorage → redirect a /login
```

### 10.4 Páginas (9)

| Página | Ruta | Roles | Descripción |
|--------|------|-------|-------------|
| Login | `/login` | Público | Email + password |
| Register | `/register` | Público | Email + password + access_code o inviteToken |
| Dashboard | `/dashboard` | Admin/Residente | Vista diferente según rol |
| Expensas | `/expensas` | Admin/Residente | Admin ve todas, residente ve las suyas + botón pagar |
| Anuncios | `/anuncios` | Admin/Residente | Admin crea, residente lee |
| Tickets | `/tickets` | Admin/Residente | Admin gestiona, residente crea |
| InviteResidente | `/invite` | Admin | Formulario para invitar |
| Audit | `/audit` | Admin | Log de auditoría |
| Amenities | `/amenities` | Admin/Residente | Calendario de reservas |
| Documents | `/documents` | Admin/Residente | Lista de PDFs |

### 10.5 Componentes shared

| Componente | Descripción |
|-----------|-------------|
| `Layout.jsx` | Shell: header con nav, notificaciones dropdown, selector comunidad, menú mobile hamburger. Incluye ChatWidget y WhatsAppButton flotantes |
| `ProtectedRoute.jsx` | Si no hay user en AuthContext → `<Navigate to="/login">` |
| `ChatWidget.jsx` | Chat flotante bottom-right con DeepSeek AI |
| `WhatsAppButton.jsx` | Botón flotante de WhatsApp |
| `Spinner.jsx` | Loading spinner |
| `PollsWidget.jsx` | Widget de encuestas |

### 10.6 Layout — Navegación

**Desktop:** Barra horizontal con links  
**Mobile (< 640px):** Hamburguesa → menú fullscreen overlay

Notificaciones: Polling cada 30 segundos (`setInterval(fetchCount, 30000)`). Badge rojo con contador de no leídas.

---

## 11. Integraciones Externas

### 11.1 MercadoPago

- **SDK:** `mercadopago` 3.2.0
- **Flujo:**
  1. Residente hace POST `/api/payments/create-preference { unitExpenseId }`
  2. Backend crea `Preference` con item de la expensa, `external_reference` único
  3. Guarda `PaymentTransaction` con `preference_id` y `fee_amount`
  4. Marca `unit_expense.status = 'in_review'`
  5. Retorna `init_point` (URL de checkout MP) al frontend
  6. Usuario paga en MP
  7. MP envía webhook `payment.created` a `/api/webhooks/mercadopago`
  8. Backend consulta el Payment a MP para verificar
  9. Si `approved` → `confirmUnitExpense()` → notifica al usuario

**Comisión estimada:** 3.99% + $10 ARS (calculada en `fee_amount`)

### 11.2 Twilio WhatsApp

- **SDK:** `twilio` 6.0.2
- **Uso:** Notificaciones outbound solamente (no chat bidireccional)
- **Mensajes enviados:**
  1. Nueva expensa creada → cada unidad con teléfono recibe WhatsApp con monto y vencimiento
  2. Pago confirmado → admins reciben confirmación

- **Manejo de errores:** Silencioso. Si Twilio no está configurado (`getClient()` retorna null), simplemente no envía. Si falla el envío, `.catch(() => {})`.

### 11.3 Nodemailer (Email)

- **Configuración:** SMTP vía variables de entorno
- **Desarrollo:** Usa Ethereal (emails falsos capturables en web)
- **Uso:**
  1. `forgotPassword`: envía link de reset (1h expiración)
  2. `invite`: envía link de registro con token

### 11.4 DeepSeek AI

- **Modelo:** `deepseek-chat`
- **Contexto:** `ChatContext.build(userId)` construye objeto con datos del usuario
- **Historial:** En memoria (Map), máximo 20 mensajes por usuario. Se pierde al reiniciar el servidor.
- **System prompt:** Incluye los datos del usuario como contexto para respuestas personalizadas.

### 11.5 ExcelJS (Reportes)

- **Uso:** Generación de reportes Excel descargables
- **Reportes:**
  1. **Delinquency:** Columnas: Unidad, Propietario (email), Total Adeudado, Días de Mora, Estado
  2. **Cashflow:** Ingresos (fixed+extra paid), Egresos (fixed+extra emitted), Pendientes, Balance

---

## 12. Jobs Programados (Cron)

### 12.1 Recordatorios de expensas

**Archivo:** `src/backend/jobs/reminders.js`  
**Horario:** Todos los días a las 9:00 AM (hora del servidor)  
**Inicio:** Al arrancar el servidor (`startReminders()` en `server.js:60`)

**Lógica:**
```
1. findDueSoon(2) → expensas que vencen en 2 días
   → Crea notificación tipo 'reminder' para cada unidad
   → Mensaje: "Tu expensa 'X' vence en 2 días (DD/MM/YYYY)"

2. findOverdue() → expensas que vencieron ayer
   → Calcula late_fee = amount_owed × late_fee_percent / 100
   → Crea notificación tipo 'reminder'
   → Mensaje: "Vencida desde ayer. Recargo X% = $Y"
```

**JOIN problemático:** `findDueSoon` y `findOverdue` hacen JOIN entre `unit_expenses` y `users` por `unit_number` (string). Si hay inconsistencias de formato, el JOIN falla silenciosamente (no se crea notificación).

---

## 13. Configuración y Variables de Entorno

### 13.1 Backend `.env`

```env
PORT=3000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/comunidad

# JWT
JWT_SECRET=cambiar-por-secreto-seguro-en-produccion
JWT_EXPIRES_IN=7d

# Email (desarrollo: Ethereal)
EMAIL_HOST=smtp.ethereal.email
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=

# MercadoPago
MP_ACCESS_TOKEN=TEST-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
MP_SUCCESS_URL=http://localhost:5173/expensas
MP_FAILURE_URL=http://localhost:5173/expensas
MP_PENDING_URL=http://localhost:5173/expensas
MP_WEBHOOK_URL=http://localhost:3000/api/webhooks/mercadopago

# DeepSeek AI
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Twilio WhatsApp
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_WHATSAPP_NUMBER=+14155238886
```

### 13.2 Docker variables (`entrypoint.sh`)

- `SEED_DB=true` → ejecuta `seed.js` después de migraciones

---

## 14. DevOps, Docker y Deploy

### 14.1 Backend Dockerfile

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache postgresql-client   # Para pg_isready
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev                       # Solo producción
COPY . .
EXPOSE 3000
CMD ["./entrypoint.sh"]
```

### 14.2 Entrypoint

```
1. Espera PostgreSQL con pg_isready (loop hasta que responde)
2. Ejecuta migraciones en orden alfabético: for f in migrations/*.sql; do psql -f "$f"; done
3. Si SEED_DB=true → node seed.js
4. Inicia: node server.js
```

### 14.3 Frontend Dockerfile

Multi-stage: `node:22-alpine` para build → `nginx:alpine` para servir estáticos.

### 14.4 Desarrollo local

```bash
# Instalar todo
npm run install:all

# Crear BD, migrar, seed
npm run db:setup

# Dev (backend + frontend concurrente)
npm run dev
```

### 14.5 Base de datos

- **Host:** PostgreSQL externo (no incluido en los Dockerfiles)
- **Nombre BD:** `comunidad`
- **Conexión:** `DATABASE_URL` connection string
- **Migraciones:** SQL raw, ejecutadas secuencialmente (001 → 012)
- **No hay sistema de rollback**

---

## 15. Seed de Datos de Desarrollo

### 15.1 Datos generados (`seed.js`)

```
2 Comunidades:
  - Torres del Parque (TORRES2024) — CABA
  - Country Los Olivos (OLIVOS2024) — Pilar

2 Admins (pass: admin123):
  - admin1@comunidad.app (Torres del Parque)
  - admin2@comunidad.app (Country Los Olivos)

10 Residentes (5 por comunidad, pass: admin123):
  - vecino11..vecino15@comunidad.app (Torres: unidades T1A..T5E)
  - vecino21..vecino25@comunidad.app (Olivos: unidades O1A..O5E)

6 Expensas (3 por comunidad):
  - Torres: $25,000 c/u ($20,000 fixed + $5,000 extra)
  - Olivos: $18,000 c/u ($15,000 fixed + $3,000 extra)
  - 2 expensas 'paid', 1 'pending' por comunidad
  - late_fee_percent = 5%, grace_days = 5

4 Anuncios (2 por comunidad)

6 Tickets con estados variados (sent, in_progress, resolved)
  - Cada uno con 1 reply de admin

4 Notificaciones no leídas

1 Encuesta: "Renovación del contrato de limpieza" (comunidad 1)

3 Amenities (comunidad 1): Quincho (20), SUM (50), Gimnasio (10)
```

### 15.2 Limpieza previa

El seed hace `TRUNCATE ... RESTART IDENTITY CASCADE` de todas las tablas antes de insertar.

---

## 16. Flujos de Negocio Principales

### 16.1 Creación de expensa (admin)

```mermaid
sequenceDiagram
    actor Admin
    participant API as POST /api/expenses
    participant DB as PostgreSQL
    participant Notif as Notifications
    participant WA as WhatsApp

    Admin->>API: { description, fixedAmount, extraAmount, due_date }
    API->>DB: BEGIN
    API->>DB: SELECT DISTINCT unit_number FROM users WHERE community_id = X
    API->>DB: INSERT expenses
    loop Por cada unidad
        API->>DB: INSERT unit_expenses (amount = total / N unidades)
    end
    API->>Notif: createForCommunity (excluyendo al admin)
    API->>DB: COMMIT
    loop Por cada unidad con teléfono
        API->>WA: sendExpenseNotification (fire-and-forget)
    end
    API-->>Admin: { expense, units_count, total_per_unit }
```

### 16.2 Pago de expensa (residente)

```
Vía comprobante manual:
  1. Residente va a /expensas, ve sus pendientes
  2. Sube foto/PDF del comprobante → PUT /api/expenses/unit/:id/pay
  3. status cambia a 'in_review', paid_at = NOW()
  4. Admin ve el comprobante → PUT /api/expenses/unit/:id/confirm
  5. status cambia a 'paid', confirmed_at = NOW()
  6. WhatsApp al admin confirmando

Vía MercadoPago:
  1. Residente hace click en "Pagar con MP"
  2. POST /api/payments/create-preference → retorna init_point
  3. Redirige al checkout de MP
  4. Al volver (success/failure/pending), MP envía webhook
  5. Webhook confirma automáticamente si approved
```

### 16.3 Ciclo de vida de un ticket

```
Residente crea ticket (status: sent)
  → Se notifica a todos los admins
Admin responde (status auto: in_progress)
  → Se notifica al residente
Admin marca resuelto (status: resolved)
  → Se notifica al residente

Restricciones:
  - Solo editable por el creador mientras status = 'sent'
  - Si admin responde en 'sent', auto-transiciona a 'in_progress'
```

### 16.4 Reserva de amenity

```
Residente selecciona amenity, fecha/hora, depósito opcional
  → Backend valida:
    1. No solapamiento con otras reservas pending/active
    2. (Reglas JSONB del amenity — implementación actual: solo validación básica)
  → Crea booking status 'pending'
  → Notifica a admins

Admin puede: aprobar (active), cancelar (cancelled), marcar finalizado (finished)
```

### 16.5 Invitación de residente

```
Admin llena formulario: email + unit_number
  → POST /api/admin/invite
  → Crea invite con token aleatorio (64 chars hex), expira en 7 días
  → Envía email con link: /register?token=xxx
Residente hace click en el link
  → GET /register?token=xxx → frontend lee token de URL
  → POST /api/auth/register { email, password, inviteToken }
  → Backend valida: token existe, no expirado, no usado, email coincide
  → Crea usuario con community_id y unit_number del invite
```

---

## 17. Limitaciones Conocidas y Deuda Técnica

### 17.1 Modelo de datos

| # | Problema | Impacto | Archivos afectados |
|---|----------|---------|-------------------|
| 1 | `unit_number` es VARCHAR libre sin FK a entidad de unidades | Sin integridad referencial. "5A" y "5a" y "5 A" son 3 unidades distintas. Imposible hacer queries por edificio/piso. | `users`, `unit_expenses`, `tickets`, `bookings`, `invites`, `reports` |
| 2 | No existe tabla `units`, `buildings`, `floors`, `complexes` | No se puede representar un edificio real con múltiples torres | Todo el sistema |
| 3 | Prorrateo equitativo (no por m² ni coeficiente) | Inviable para edificios con departamentos de distinto tamaño | `expenseController.create` (línea 29-31) |
| 4 | JOIN entre `unit_expenses` y `users` por `unit_number` (string) | Frágil. Si un unit_number cambia o tiene formato inconsistente, las queries fallan silenciosamente | `Expense.findDueSoon`, `Expense.findOverdue` |
| 5 | `createForCommunity` hace INSERTs secuenciales en loop | N+1 problem. Con 500+ usuarios es muy lento | `models/Notification.js:18-28` |
| 6 | No hay soft-delete en `ticket_replies`, `bookings`, `notifications` | Inconsistencia: algunos modelos tienen soft-delete y otros no | Varios |

### 17.2 Arquitectura

| # | Problema | Impacto | Sugerencia |
|---|----------|---------|-----------|
| 7 | Sin capa de servicios | Lógica de negocio mezclada entre controllers y models. Difícil testear. | Crear `services/` con lógica de dominio pura |
| 8 | Sin tests automatizados | 0 tests en todo el proyecto. Cada cambio requiere testing manual completo. | Agregar Jest + Supertest |
| 9 | Sin sistema de migraciones con rollback | Si una migración falla a mitad de camino, no hay vuelta atrás automática | Usar `knex` o `node-pg-migrate` |
| 10 | Historial de chat en memoria (Map) | Se pierde al reiniciar. No escala horizontal | Mover a Redis o PostgreSQL |
| 11 | Rate limiter en memoria (no Redis) | No funciona con múltiples instancias de la app | Usar `rate-limit-redis` |
| 12 | Sin logging estructurado | Solo `console.log/error`. Difícil debuggear en producción | Agregar `winston` o `pino` |

### 17.3 Frontend

| # | Problema | Impacto |
|---|----------|---------|
| 13 | CSS inline (objetos JS) en vez de CSS modules o framework | Difícil mantener consistencia visual. No hay theming. |
| 14 | Sin PWA / Service Worker | Sin soporte offline, sin notificaciones push nativas |
| 15 | Sin manejo de estado global (solo Context) | Para apps más complejas, Context causa re-renders innecesarios |
| 16 | Polling cada 30s para notificaciones | Ineficiente. Debería ser WebSocket o SSE |
| 17 | Sin i18n / traducciones | Todo hardcodeado en español. No escala a otros mercados. |

### 17.4 Seguridad

| # | Problema | Impacto |
|---|----------|---------|
| 18 | CORS abierto (`app.use(cors())`) | Cualquier origen puede hacer requests |
| 19 | Sin validación de `community_id` en el JWT para operaciones sensibles | Un admin de comunidad A podría teóricamente acceder a datos de comunidad B si modifica el query param. El middleware `setCommunity` no verifica que el admin realmente pertenezca a esa comunidad. |
| 20 | Sin límite de upload size por tipo de archivo | Solo se valida extensión (`.pdf, .jpg, .jpeg, .png`), no el contenido real |
| 21 | Secretos en `.env` (JWT_SECRET default inseguro) | El archivo `.env` existe en el repo con valores placeholder. Riesgo de commit accidental con secretos reales. |

### 17.5 Performance

| # | Problema | Impacto |
|---|----------|---------|
| 22 | Sin caché (Redis o similar) | Dashboard admin recalcula todo en cada request |
| 23 | Sin índices compuestos para queries frecuentes | Con 10k+ registros, los JOINs y COUNTs se degradan |
| 24 | Sin connection pooling configurado | `pg.Pool` usa defaults. Sin `max`, `idleTimeoutMillis` explícitos |
| 25 | Sin compresión de respuestas | Responses JSON sin gzip/brotli |

### 17.6 Documentación

| # | Problema | Impacto |
|---|----------|---------|
| 26 | Sin documentación de API (Swagger/OpenAPI) | Solo existe este documento |
| 27 | Código parcialmente comentado | Los archivos existentes casi no tienen comentarios |
| 28 | Sin CHANGELOG ni versionado semántico | No hay tracking de cambios entre versiones |

---

## Apéndice A: Lista completa de archivos

### Backend (43 archivos fuente)

```
src/backend/
  server.js
  db.js
  seed.js
  .env
  Dockerfile
  entrypoint.sh
  package.json
  controllers/ (15): auth, expense, ticket, announcement, dashboard, payment,
                    notification, user, admin, reports, booking, chat, polls,
                    documents, audit
  models/ (14): User, Expense, Ticket, Announcement, Dashboard, Notification,
                Invite, Poll, Report, Audit, PaymentTransaction, Booking,
                ChatContext, Document
  routes/ (16): auth, expenses, tickets, announcements, dashboard, payments,
                notifications, users, admin, reports, bookings, chat, polls,
                documents, webhooks, phone
  middleware/ (7): auth, authorize, setCommunity, sanitize, rateLimiter,
                   logAudit, uploadsAuth
  jobs/ (1): reminders
  services/ (1): whatsapp
  migrations/ (12): 001..012
```

### Frontend (18 archivos fuente)

```
src/frontend/
  vite.config.js
  index.html
  Dockerfile
  package.json
  src/
    App.jsx
    main.jsx
    context/ (2): AuthContext, CommunityContext
    components/ (6): Layout, ProtectedRoute, ChatWidget, WhatsAppButton,
                     Spinner, PollsWidget
    pages/ (9): Login, Register, Dashboard, Expensas, Anuncios, Tickets,
                InviteResidente, Audit, Amenities, Documents
    services/ (7): api, expensas, comunicacion, payments, bookings, chat, errors
```

---

## Apéndice B: Diagrama de módulos del sistema

```mermaid
flowchart TD
    subgraph "Módulos Core"
        AUTH[Autenticación]
        DASH[Dashboard]
        EXP[Expensas]
        TICK[Tickets]
        ANN[Anuncios]
    end

    subgraph "Módulos Secundarios"
        AMEN[Amenities/Bookings]
        POLLS[Votaciones]
        DOCS[Documentos]
        REP[Reportes Excel]
    end

    subgraph "Infraestructura"
        NOTIF[Notificaciones]
        AUDIT[Auditoría]
        INVITE[Invitaciones]
        CHAT[Chat AI]
    end

    subgraph "Integraciones"
        MP[MercadoPago]
        WA[WhatsApp Twilio]
        EMAIL[Nodemailer]
        AI[DeepSeek]
    end

    EXP --> MP
    EXP --> WA
    AUTH --> EMAIL
    INVITE --> EMAIL
    CHAT --> AI
    EXP --> NOTIF
    TICK --> NOTIF
    ANN --> NOTIF
```

---

*Documento generado a partir del análisis exhaustivo del código fuente. Julio 2026.*
