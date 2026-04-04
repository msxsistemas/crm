-- Add office hours columns to settings table
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS office_hours_enabled BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS office_hours_off_message TEXT DEFAULT 'No momento estamos fora do horário de atendimento. Retornaremos em breve!',
  ADD COLUMN IF NOT EXISTS office_hours_schedule JSONB DEFAULT '[]';
