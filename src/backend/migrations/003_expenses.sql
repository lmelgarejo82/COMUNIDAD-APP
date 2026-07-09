CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  community_id INTEGER NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
  description VARCHAR(255) NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  due_date DATE NOT NULL,
  period VARCHAR(20),
  is_extraordinary BOOLEAN DEFAULT FALSE,
  created_by INTEGER NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  file_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS unit_expenses (
  id SERIAL PRIMARY KEY,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  unit_number VARCHAR(20) NOT NULL,
  amount_owed DECIMAL(10, 2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_review', 'paid')),
  payment_proof_url VARCHAR(500),
  paid_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  UNIQUE(expense_id, unit_number)
);
