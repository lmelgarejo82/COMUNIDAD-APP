ALTER TABLE users ADD COLUMN IF NOT EXISTS user_type VARCHAR(10) DEFAULT 'owner' CHECK (user_type IN ('owner', 'tenant'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);

CREATE TABLE IF NOT EXISTS polls (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  options JSONB NOT NULL DEFAULT '[]',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS poll_votes (
  id SERIAL PRIMARY KEY,
  poll_id INTEGER NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_index INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(poll_id, user_id)
);

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url VARCHAR(500) NOT NULL,
  uploaded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Seed: votación de prueba
INSERT INTO polls (community_id, title, description, options, created_by, expires_at)
VALUES (1, 'Renovación del contrato de limpieza', 'Votar para aprobar o rechazar la renovación del servicio de limpieza por un año más.',
  '["Aprobar", "Rechazar", "Abstenerse"]', 1, NOW() + interval '30 days')
ON CONFLICT DO NOTHING;
