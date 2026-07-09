CREATE TABLE IF NOT EXISTS payment_transactions (
  id SERIAL PRIMARY KEY,
  unit_expense_id INTEGER NOT NULL REFERENCES unit_expenses(id) ON DELETE CASCADE,
  preference_id VARCHAR(100) UNIQUE NOT NULL,
  payment_id VARCHAR(100),
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  external_reference VARCHAR(100),
  fee_amount DECIMAL(10, 2) DEFAULT 0,
  mercadopago_response JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pt_preference ON payment_transactions(preference_id);
CREATE INDEX IF NOT EXISTS idx_pt_unit_expense ON payment_transactions(unit_expense_id);
