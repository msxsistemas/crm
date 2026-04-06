ALTER TABLE settings ADD COLUMN IF NOT EXISTS csat_delay_minutes INTEGER DEFAULT 0;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS csat_message TEXT DEFAULT '⭐ Como foi seu atendimento? Avalie de 1 a 5.';
