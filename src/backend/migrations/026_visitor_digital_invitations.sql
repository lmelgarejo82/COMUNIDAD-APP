CREATE TABLE IF NOT EXISTS visitor_digital_invitations (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  preauthorization_id INTEGER NOT NULL REFERENCES visitor_preauthorizations(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL UNIQUE,
  token_hint VARCHAR(16),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  revoked_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_digital_invitations_community
  ON visitor_digital_invitations(community_id);

CREATE INDEX IF NOT EXISTS idx_visitor_digital_invitations_preauthorization
  ON visitor_digital_invitations(preauthorization_id);

CREATE INDEX IF NOT EXISTS idx_visitor_digital_invitations_expires_at
  ON visitor_digital_invitations(expires_at);

CREATE INDEX IF NOT EXISTS idx_visitor_digital_invitations_revoked_at
  ON visitor_digital_invitations(revoked_at);
