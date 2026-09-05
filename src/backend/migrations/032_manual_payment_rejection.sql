ALTER TABLE unit_expenses
  DROP CONSTRAINT IF EXISTS unit_expenses_status_check;

ALTER TABLE unit_expenses
  ADD CONSTRAINT unit_expenses_status_check
  CHECK (status IN ('pending', 'in_review', 'paid', 'rejected'));
