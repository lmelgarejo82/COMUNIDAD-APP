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

INSERT INTO communities (name, address, access_code)
VALUES ('Comunidad Demo', 'Calle Falsa 123', 'DEMO2024')
ON CONFLICT (access_code) DO NOTHING;
