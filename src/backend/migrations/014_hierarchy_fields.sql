ALTER TABLE units ADD COLUMN IF NOT EXISTS coef_percent DECIMAL(5, 2);
ALTER TABLE units ADD COLUMN IF NOT EXISTS area_m2 DECIMAL(8, 2);

CREATE INDEX IF NOT EXISTS idx_units_coef ON units(coef_percent);
CREATE INDEX IF NOT EXISTS idx_units_area ON units(area_m2);
