CREATE TABLE IF NOT EXISTS organizations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  legal_name VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE communities
  ADD COLUMN IF NOT EXISTS organization_id INTEGER REFERENCES organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_communities_organization ON communities(organization_id);

INSERT INTO organizations (name, legal_name, created_at)
SELECT c.name, c.name, COALESCE(c.created_at, NOW())
FROM communities c
WHERE c.organization_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM organizations o WHERE o.name = c.name
  );

UPDATE communities c
SET organization_id = o.id
FROM organizations o
WHERE c.organization_id IS NULL
  AND o.name = c.name;
