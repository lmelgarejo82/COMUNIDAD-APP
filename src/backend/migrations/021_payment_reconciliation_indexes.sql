CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_external_reference_unique
ON payment_transactions(external_reference)
WHERE external_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pt_payment_id_unique
ON payment_transactions(payment_id)
WHERE payment_id IS NOT NULL;
