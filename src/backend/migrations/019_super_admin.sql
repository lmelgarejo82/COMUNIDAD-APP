-- ============================================================
-- 019: is_super_admin + complex management
-- ============================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN DEFAULT FALSE;

-- Promote admin1 (the seed default) to superadmin
UPDATE users SET is_super_admin = TRUE WHERE email = 'admin1@comunidad.app';
