CREATE TABLE IF NOT EXISTS visitor_preauthorizations (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  complex_id INTEGER REFERENCES complexes(id) ON DELETE SET NULL,
  unit_id INTEGER REFERENCES units(id) ON DELETE SET NULL,
  visitor_name VARCHAR(255) NOT NULL,
  visitor_document VARCHAR(80),
  visitor_phone VARCHAR(80),
  vehicle_plate VARCHAR(40),
  visit_type VARCHAR(50) NOT NULL,
  destination_label VARCHAR(255),
  authorized_by VARCHAR(255),
  notes TEXT,
  expected_from TIMESTAMPTZ,
  expected_until TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'used', 'cancelled', 'expired')),
  used_access_log_id INTEGER REFERENCES visitor_access_logs(id) ON DELETE SET NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE visitor_access_logs
  ADD COLUMN IF NOT EXISTS preauthorization_id INTEGER REFERENCES visitor_preauthorizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_visitor_preauth_community ON visitor_preauthorizations(community_id);
CREATE INDEX IF NOT EXISTS idx_visitor_preauth_complex ON visitor_preauthorizations(complex_id);
CREATE INDEX IF NOT EXISTS idx_visitor_preauth_unit ON visitor_preauthorizations(unit_id);
CREATE INDEX IF NOT EXISTS idx_visitor_preauth_status ON visitor_preauthorizations(status);
CREATE INDEX IF NOT EXISTS idx_visitor_preauth_expected_until ON visitor_preauthorizations(expected_until);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_preauth ON visitor_access_logs(preauthorization_id);
