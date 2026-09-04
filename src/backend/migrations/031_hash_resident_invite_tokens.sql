BEGIN;

ALTER TABLE invites
  ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);

-- Plaintext credentials created by older releases are not carried forward.
-- Used rows remain available for audit; unused rows require admin reissue.
UPDATE invites
SET expires_at = LEAST(expires_at, NOW())
WHERE used IS NOT TRUE
  AND token_hash IS NULL;

ALTER TABLE invites
  DROP COLUMN IF EXISTS token;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invites_token_hash
  ON invites(token_hash)
  WHERE token_hash IS NOT NULL;

COMMIT;
