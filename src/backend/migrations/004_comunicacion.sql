CREATE TABLE IF NOT EXISTS announcements (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  file_url VARCHAR(500),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcement_reads (
  id SERIAL PRIMARY KEY,
  announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(announcement_id, user_id)
);

DROP TABLE IF EXISTS tickets CASCADE;

CREATE TABLE IF NOT EXISTS tickets (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_number VARCHAR(20) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  file_url VARCHAR(500),
  status VARCHAR(20) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'in_progress', 'resolved')),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ticket_replies (
  id SERIAL PRIMARY KEY,
  ticket_id INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  file_url VARCHAR(500),
  is_admin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  reference_id INTEGER,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);
