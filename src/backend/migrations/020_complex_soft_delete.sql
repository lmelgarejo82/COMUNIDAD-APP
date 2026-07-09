-- ============================================================
-- 020: Soft-delete para complexes y communities
-- ============================================================

ALTER TABLE complexes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;
ALTER TABLE communities ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_complexes_deleted ON complexes(deleted_at);
CREATE INDEX IF NOT EXISTS idx_communities_deleted ON communities(deleted_at);
