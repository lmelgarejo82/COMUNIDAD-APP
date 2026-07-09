ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS fixed_amount DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS extra_amount DECIMAL(10, 2) DEFAULT 0;

UPDATE expenses
SET fixed_amount = amount, extra_amount = 0
WHERE fixed_amount IS NULL;

ALTER TABLE unit_expenses
  ADD COLUMN IF NOT EXISTS fixed_part DECIMAL(10, 2),
  ADD COLUMN IF NOT EXISTS extra_part DECIMAL(10, 2) DEFAULT 0;

UPDATE unit_expenses
SET fixed_part = amount_owed, extra_part = 0
WHERE fixed_part IS NULL;
