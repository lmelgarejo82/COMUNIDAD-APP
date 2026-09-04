ALTER TABLE users
  ADD COLUMN IF NOT EXISTS reset_token_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS auth_version INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'users'
      AND column_name = 'reset_token'
  ) THEN
    UPDATE users
    SET reset_token_expires = NULL
    WHERE reset_token IS NOT NULL;

    ALTER TABLE users DROP COLUMN reset_token;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_reset_token_hash
  ON users(reset_token_hash)
  WHERE reset_token_hash IS NOT NULL;
