CREATE TABLE IF NOT EXISTS visitor_access_logs (
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
  entry_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  exit_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'inside' CHECK (status IN ('inside', 'exited', 'cancelled')),
  observed_at TIMESTAMPTZ,
  observed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  observation_note TEXT,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  exited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_community ON visitor_access_logs(community_id);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_complex ON visitor_access_logs(complex_id);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_unit ON visitor_access_logs(unit_id);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_status ON visitor_access_logs(status);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_entry_at ON visitor_access_logs(entry_at);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_exit_at ON visitor_access_logs(exit_at);
CREATE INDEX IF NOT EXISTS idx_visitor_access_logs_observed_at ON visitor_access_logs(observed_at);
