ALTER TABLE master_tickets DROP CONSTRAINT IF EXISTS master_tickets_status_check;
ALTER TABLE master_tickets ADD CONSTRAINT master_tickets_status_check CHECK (status IN ('active', 'open', 'closed', 'cancelled'));
