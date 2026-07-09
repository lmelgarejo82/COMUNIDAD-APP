# Comunidad App

App de gestión de comunidades (consorcios, countries, barrios cerrados).

**Tecnologías:** Node.js + Express + PostgreSQL | React + Vite | JWT | Docker

## Requisitos

- Docker y Docker Compose
- _(Alternativa sin Docker)_ Node.js 22, PostgreSQL 18

## Levantar con Docker

```bash
# Clonar el repo
git clone <repo-url> comunidad-app && cd comunidad-app

# Construir y levantar todos los servicios (el seed corre automáticamente la primera vez)
docker compose up -d --build
```

**Servicios:**

| Servicio | URL | Descripción |
|---|---|---|
| Frontend | http://localhost:8080 | React SPA servido por Nginx |
| Backend | http://localhost:3000 | API REST |
| PostgreSQL | localhost:5432 | Base de datos |

El backend espera a que PostgreSQL esté listo, ejecuta las migraciones, y si `SEED_DB=true` (por defecto en docker-compose) ejecuta el seed también.

**En despliegues posteriores**, setear `SEED_DB=false` en docker-compose.yml para no volver a correr el seed. Para correr el seed manualmente:

```bash
docker compose exec backend node seed.js
```

## Levantar en local (sin Docker)

### Requisitos

- Node.js 22+
- PostgreSQL 18 corriendo

### Setup

```bash
# 1. Instalar dependencias
npm run install:all

# 2. Crear base de datos
psql -U postgres -c "CREATE DATABASE comunidad;"

# 3. Configurar entorno
cp src/backend/.env.example src/backend/.env
# Editar src/backend/.env con tus credenciales

# 4. Migrar y sembrar
npm run db:migrate
npm run db:seed

# 5. Arrancar
npm run dev
```

- Frontend: http://localhost:5173
- Backend: http://localhost:3000

## Datos de prueba

Después de correr el seed (`npm run db:seed` o `docker compose exec backend node seed.js`):

| Usuario | Password | Rol | Comunidad |
|---|---|---|---|
| admin1@comunidad.app | admin123 | admin | Torres del Parque |
| admin2@comunidad.app | admin123 | admin | Country Los Olivos |
| vecino11..vecino15@comunidad.app | admin123 | residente | Torres del Parque |
| vecino21..vecino25@comunidad.app | admin123 | residente | Country Los Olivos |

**Códigos de registro:** `TORRES2024` y `OLIVOS2024`

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Backend + frontend en desarrollo |
| `npm run dev:backend` | Solo backend (puerto 3000) |
| `npm run dev:frontend` | Solo frontend (puerto 5173) |
| `npm run install:all` | Instalar dependencias de los 3 packages |
| `npm run db:migrate` | Ejecutar migraciones pendientes con historial en `schema_migrations` |
| `npm run db:seed` | Sembrar datos de prueba |
| `npm run db:setup` | Migrar + sembrar |

Las migraciones se aplican en orden por nombre de archivo y se registran con checksum. Si una migración ya aplicada cambia, el runner aborta para evitar despliegues inconsistentes.

## Endpoints

| Módulo | Rutas |
|---|---|
| **Auth** | `POST /api/auth/register`, `/login`, `/forgot-password`, `/reset-password/:token` |
| **Dashboard** | `GET /api/dashboard/residente`, `/admin` |
| **Expensas** | `POST/GET /api/expenses`, `GET /my`, `PUT /:id`, `PUT /unit/:id/pay`, `PUT /unit/:id/confirm` |
| **Anuncios** | `POST/GET /api/announcements`, `GET /admin`, `PUT /:id/read`, `DELETE /:id` |
| **Tickets** | `POST/GET /api/tickets`, `GET /my`, `PUT /:id`, `PUT /:id/status`, `POST /:id/reply` |
| **Notificaciones** | `GET /api/notifications`, `/count`, `PUT /:id/read`, `PUT /read-all` |
| **Perfil** | `GET/PUT /api/users/me` |
