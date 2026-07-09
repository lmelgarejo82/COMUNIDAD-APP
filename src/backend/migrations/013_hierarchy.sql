BEGIN;

-- ============================================================
-- 1. CREATE HIERARCHY TABLES
-- ============================================================

CREATE TABLE IF NOT EXISTS complexes (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(255),
  community_id INTEGER REFERENCES communities(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS buildings (
  id SERIAL PRIMARY KEY,
  complex_id INTEGER NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  address VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floors (
  id SERIAL PRIMARY KEY,
  building_id INTEGER NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  number INTEGER NOT NULL,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS units (
  id SERIAL PRIMARY KEY,
  floor_id INTEGER NOT NULL REFERENCES floors(id) ON DELETE CASCADE,
  unit_code VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(floor_id, unit_code)
);

CREATE TABLE IF NOT EXISTS unit_ownerships (
  id SERIAL PRIMARY KEY,
  unit_id INTEGER NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ownership_type VARCHAR(10) DEFAULT 'owner' CHECK (ownership_type IN ('owner', 'tenant')),
  is_primary BOOLEAN DEFAULT TRUE,
  start_date TIMESTAMP DEFAULT NOW(),
  end_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(unit_id, user_id)
);

-- ============================================================
-- 2. INDEXES ON HIERARCHY TABLES
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_complexes_community ON complexes(community_id);
CREATE INDEX IF NOT EXISTS idx_buildings_complex ON buildings(complex_id);
CREATE INDEX IF NOT EXISTS idx_floors_building ON floors(building_id);
CREATE INDEX IF NOT EXISTS idx_units_floor ON units(floor_id);
CREATE INDEX IF NOT EXISTS idx_units_code ON units(unit_code);
CREATE INDEX IF NOT EXISTS idx_unit_ownerships_unit ON unit_ownerships(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_ownerships_user ON unit_ownerships(user_id);

-- ============================================================
-- 3. ADD unit_id COLUMN TO EXISTING TABLES
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE unit_expenses ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;
ALTER TABLE invites ADD COLUMN IF NOT EXISTS unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL;

-- ============================================================
-- 4. INDEXES ON NEW unit_id COLUMNS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_users_unit ON users(unit_id);
CREATE INDEX IF NOT EXISTS idx_unit_expenses_unit ON unit_expenses(unit_id);
CREATE INDEX IF NOT EXISTS idx_tickets_unit ON tickets(unit_id);
CREATE INDEX IF NOT EXISTS idx_bookings_unit ON bookings(unit_id);
CREATE INDEX IF NOT EXISTS idx_invites_unit ON invites(unit_id);

-- ============================================================
-- 5. DATA MIGRATION: communities → complexes
--    Cada community existente se convierte en un complex.
-- ============================================================

INSERT INTO complexes (name, address, community_id, created_at)
SELECT c.name, c.address, c.id, COALESCE(c.created_at, NOW())
FROM communities c
WHERE NOT EXISTS (
  SELECT 1 FROM complexes WHERE complexes.community_id = c.id
);

-- ============================================================
-- 6. DATA MIGRATION: cada complex → 1 building
-- ============================================================

INSERT INTO buildings (complex_id, name, created_at)
SELECT cx.id, 'Edificio Principal', cx.created_at
FROM complexes cx
WHERE NOT EXISTS (
  SELECT 1 FROM buildings b WHERE b.complex_id = cx.id
);

-- ============================================================
-- 7. DATA MIGRATION: cada building → 1 floor
-- ============================================================

INSERT INTO floors (building_id, number, name, created_at)
SELECT b.id, 1, 'Piso 1', b.created_at
FROM buildings b
WHERE NOT EXISTS (
  SELECT 1 FROM floors f WHERE f.building_id = b.id
);

-- ============================================================
-- 8. DATA MIGRATION: unit_number de users → units
--    Se ignoran unit_number NULL o vacíos.
--    unit_code = TRIM(unit_number)
-- ============================================================

INSERT INTO units (floor_id, unit_code, created_at)
SELECT DISTINCT ON (f.id, TRIM(u.unit_number))
  f.id,
  TRIM(u.unit_number),
  NOW()
FROM users u
JOIN communities c ON u.community_id = c.id
JOIN complexes cx ON cx.community_id = c.id
JOIN buildings b ON b.complex_id = cx.id
JOIN floors f ON f.building_id = b.id
WHERE u.unit_number IS NOT NULL
  AND TRIM(u.unit_number) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM units un
    WHERE un.floor_id = f.id
      AND un.unit_code = TRIM(u.unit_number)
  );

-- ============================================================
-- 9. DATA MIGRATION: usuarios activos → unit_ownerships
--    Se usa user_type como ownership_type; si es NULL, 'owner'.
--    start_date toma la fecha de creación del usuario.
-- ============================================================

INSERT INTO unit_ownerships (unit_id, user_id, ownership_type, is_primary, start_date, created_at)
SELECT un.id, u.id, COALESCE(u.user_type, 'owner'), TRUE, u.created_at, NOW()
FROM users u
JOIN communities c ON u.community_id = c.id
JOIN complexes cx ON cx.community_id = c.id
JOIN buildings b ON b.complex_id = cx.id
JOIN floors f ON f.building_id = b.id
JOIN units un ON un.floor_id = f.id AND un.unit_code = TRIM(u.unit_number)
WHERE u.unit_number IS NOT NULL
  AND TRIM(u.unit_number) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM unit_ownerships uo
    WHERE uo.user_id = u.id AND uo.unit_id = un.id
  );

-- ============================================================
-- 10. POPULATE users.unit_id desde unit_ownerships
-- ============================================================

UPDATE users u
SET unit_id = uo.unit_id
FROM unit_ownerships uo
WHERE u.id = uo.user_id
  AND u.unit_id IS NULL;

-- ============================================================
-- 11. POPULATE unit_expenses.unit_id
--     Relación vía expenses.community_id → complex → building → floor → unit
-- ============================================================

UPDATE unit_expenses ue
SET unit_id = un.id
FROM expenses e
JOIN complexes cx ON cx.community_id = e.community_id
JOIN buildings b ON b.complex_id = cx.id
JOIN floors f ON f.building_id = b.id
JOIN units un ON un.floor_id = f.id
WHERE ue.expense_id = e.id
  AND ue.unit_id IS NULL
  AND ue.unit_number IS NOT NULL
  AND TRIM(ue.unit_number) <> ''
  AND un.unit_code = TRIM(ue.unit_number);

-- ============================================================
-- 12. POPULATE tickets.unit_id
--     Relación directa vía tickets.community_id
-- ============================================================

UPDATE tickets tk
SET unit_id = un.id
FROM complexes cx
JOIN buildings b ON b.complex_id = cx.id
JOIN floors f ON f.building_id = b.id
JOIN units un ON un.floor_id = f.id
WHERE cx.community_id = tk.community_id
  AND tk.unit_id IS NULL
  AND tk.unit_number IS NOT NULL
  AND TRIM(tk.unit_number) <> ''
  AND un.unit_code = TRIM(tk.unit_number);

-- ============================================================
-- 13. POPULATE bookings.unit_id
--     Relación vía amenities.community_id
-- ============================================================

UPDATE bookings bk
SET unit_id = un.id
FROM amenities a
JOIN complexes cx ON cx.community_id = a.community_id
JOIN buildings b ON b.complex_id = cx.id
JOIN floors f ON f.building_id = b.id
JOIN units un ON un.floor_id = f.id
WHERE bk.amenity_id = a.id
  AND bk.unit_id IS NULL
  AND bk.unit_number IS NOT NULL
  AND TRIM(bk.unit_number) <> ''
  AND un.unit_code = TRIM(bk.unit_number);

-- ============================================================
-- 14. POPULATE invites.unit_id
--     Relación directa vía invites.community_id
-- ============================================================

UPDATE invites iv
SET unit_id = un.id
FROM complexes cx
JOIN buildings b ON b.complex_id = cx.id
JOIN floors f ON f.building_id = b.id
JOIN units un ON un.floor_id = f.id
WHERE cx.community_id = iv.community_id
  AND iv.unit_id IS NULL
  AND iv.unit_number IS NOT NULL
  AND TRIM(iv.unit_number) <> ''
  AND un.unit_code = TRIM(iv.unit_number);

COMMIT;
