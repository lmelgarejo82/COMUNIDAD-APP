ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS category VARCHAR(50) NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS location_label VARCHAR(255);

DO $$
BEGIN
  ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_category_check;
  ALTER TABLE tickets
    ADD CONSTRAINT tickets_category_check
    CHECK (category IN ('maintenance', 'cleaning', 'security', 'coexistence', 'administration', 'amenities', 'other'));

  ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_priority_check;
  ALTER TABLE tickets
    ADD CONSTRAINT tickets_priority_check
    CHECK (priority IN ('low', 'medium', 'high', 'urgent'));

  ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
  ALTER TABLE tickets
    ADD CONSTRAINT tickets_status_check
    CHECK (status IN ('sent', 'in_review', 'in_progress', 'resolved', 'closed', 'cancelled'));
END $$;

CREATE INDEX IF NOT EXISTS idx_tickets_category ON tickets(category);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
