CREATE TABLE IF NOT EXISTS amenities (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  capacity INTEGER DEFAULT 1,
  rules JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id SERIAL PRIMARY KEY,
  amenity_id INTEGER NOT NULL REFERENCES amenities(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  unit_number VARCHAR(20) NOT NULL,
  date_from TIMESTAMP NOT NULL,
  date_to TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'finished', 'cancelled')),
  deposit_amount DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_amenity ON bookings(amenity_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_dates ON bookings(date_from, date_to);

-- Seed: amenities de prueba para la comunidad 1
INSERT INTO amenities (community_id, name, description, capacity, rules)
VALUES
  (1, 'Quincho / Parrilla', 'Espacio con parrilla, mesa para 10 personas y pileta', 20, '{"max_hours": 4, "advance_hours": 48, "deposit": 5000}'),
  (1, 'SUM (Salón de Usos Múltiples)', 'Salón cerrado con cocina y baño', 50, '{"max_hours": 4, "advance_hours": 48, "deposit": 8000}'),
  (1, 'Gimnasio', 'Espacio con máquinas de musculación y cardio', 10, '{"max_hours": 2, "advance_hours": 24, "deposit": 0}')
ON CONFLICT DO NOTHING;
