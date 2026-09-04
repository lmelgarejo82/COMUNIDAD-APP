ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS ownership_type VARCHAR(10);

UPDATE invites
SET ownership_type = 'owner'
WHERE ownership_type IS NULL;

ALTER TABLE invites
  ALTER COLUMN ownership_type SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invites_ownership_type_check'
      AND conrelid = 'invites'::regclass
  ) THEN
    ALTER TABLE invites
      ADD CONSTRAINT invites_ownership_type_check
      CHECK (ownership_type IN ('owner', 'tenant'));
  END IF;
END $$;
