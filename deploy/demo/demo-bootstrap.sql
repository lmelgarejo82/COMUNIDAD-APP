-- Demo-only compatibility bootstrap for legacy migration 012, whose historical
-- seed references users.id=1. The guarded demo reset removes this entire
-- community and its disposable user after all migrations finish.
CREATE TABLE IF NOT EXISTS communities (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(255),
  access_code VARCHAR(50) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'residente' CHECK (role IN ('admin', 'residente')),
  unit_number VARCHAR(20),
  community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  reset_token VARCHAR(255),
  reset_token_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO communities (id, name, address, access_code)
VALUES (1, 'Comunidad Demo', 'Dirección ficticia', 'DEMO2024')
ON CONFLICT (access_code) DO NOTHING;

INSERT INTO users (id, email, password_hash, role, community_id)
VALUES (1, 'migration-bootstrap@example.invalid', '!', 'admin', 1)
ON CONFLICT (email) DO NOTHING;

SELECT setval(pg_get_serial_sequence('communities', 'id'), GREATEST((SELECT MAX(id) FROM communities), 1), true);
SELECT setval(pg_get_serial_sequence('users', 'id'), GREATEST((SELECT MAX(id) FROM users), 1), true);
