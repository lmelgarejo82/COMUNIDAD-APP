DO $$
DECLARE
  ownership_cutoff TIMESTAMP;
BEGIN
  SELECT applied_at AT TIME ZONE current_setting('TimeZone')
  INTO STRICT ownership_cutoff
  FROM schema_migrations
  WHERE filename = '028_invite_ownership_type.sql';

  UPDATE invites
  SET expires_at = LEAST(expires_at, ownership_cutoff)
  WHERE used IS NOT TRUE
    AND (created_at IS NULL OR created_at <= ownership_cutoff);
END $$;
