-- ============================================================
-- 014: Master Tickets
--     Permite crear tickets masivos que se propagan a unidades
--     específicas, pisos completos o edificios completos.
-- ============================================================

CREATE TABLE IF NOT EXISTS master_tickets (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  type VARCHAR(30) DEFAULT 'general' CHECK (type IN ('general', 'maintenance', 'inspection', 'emergency', 'communication')),
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'closed', 'cancelled')),
  file_url VARCHAR(500),
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS master_ticket_units (
  id SERIAL PRIMARY KEY,
  master_ticket_id INTEGER NOT NULL REFERENCES master_tickets(id) ON DELETE CASCADE,
  unit_id INTEGER REFERENCES units(id) ON DELETE CASCADE,
  building_id INTEGER REFERENCES buildings(id) ON DELETE CASCADE,
  floor_id INTEGER REFERENCES floors(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  CHECK (
    (unit_id IS NOT NULL)::int +
    (floor_id IS NOT NULL)::int +
    (building_id IS NOT NULL)::int = 1
  ),
  UNIQUE(master_ticket_id, unit_id),
  UNIQUE(master_ticket_id, building_id),
  UNIQUE(master_ticket_id, floor_id)
);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS master_ticket_id INTEGER REFERENCES master_tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_master_tickets_community ON master_tickets(community_id);
CREATE INDEX IF NOT EXISTS idx_master_tickets_status ON master_tickets(status);
CREATE INDEX IF NOT EXISTS idx_master_tickets_type ON master_tickets(type);
CREATE INDEX IF NOT EXISTS idx_master_ticket_units_master ON master_ticket_units(master_ticket_id);
CREATE INDEX IF NOT EXISTS idx_master_ticket_units_unit ON master_ticket_units(unit_id);
CREATE INDEX IF NOT EXISTS idx_master_ticket_units_building ON master_ticket_units(building_id);
CREATE INDEX IF NOT EXISTS idx_master_ticket_units_floor ON master_ticket_units(floor_id);
CREATE INDEX IF NOT EXISTS idx_tickets_master ON tickets(master_ticket_id);
