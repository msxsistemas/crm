ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_labels_enabled BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS out_of_hours_enabled BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS out_of_hours_message TEXT;
