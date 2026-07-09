-- ============================================================
-- 018: admin_complexes + deleted_at for soft-delete
-- ============================================================

-- Admin ↔ Complex many-to-many
CREATE TABLE IF NOT EXISTS admin_complexes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  complex_id INTEGER NOT NULL REFERENCES complexes(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, complex_id)
);
CREATE INDEX IF NOT EXISTS idx_admin_complexes_user ON admin_complexes(user_id);
CREATE INDEX IF NOT EXISTS idx_admin_complexes_complex ON admin_complexes(complex_id);

-- Soft-delete: convert is_active to deleted_at pattern (consistent with expenses/announcements/tickets)
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE units ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_buildings_deleted ON buildings(deleted_at);
CREATE INDEX IF NOT EXISTS idx_floors_deleted ON floors(deleted_at);
CREATE INDEX IF NOT EXISTS idx_units_deleted ON units(deleted_at);

-- Populate admin_complexes from existing admins (1 admin → 1 community → 1 complex)
INSERT INTO admin_complexes (user_id, complex_id)
SELECT u.id, cx.id
FROM users u
JOIN complexes cx ON cx.community_id = u.community_id
WHERE u.role = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM admin_complexes ac WHERE ac.user_id = u.id AND ac.complex_id = cx.id
  );

-- Seed: give admin1 access to both existing complexes (for demo multi-complex)
-- Admin1 (user_id=1) already has Torres del Parque via the INSERT above.
-- Country Los Olivos complex should be complex_id=2.
-- We add Country Los Olivos to admin1 if it exists.
INSERT INTO admin_complexes (user_id, complex_id)
SELECT 1, cx.id FROM complexes cx WHERE cx.id = 2
  AND NOT EXISTS (SELECT 1 FROM admin_complexes ac WHERE ac.user_id = 1 AND ac.complex_id = cx.id);
