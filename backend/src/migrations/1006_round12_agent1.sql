CREATE TABLE IF NOT EXISTS chat_widgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  greeting TEXT DEFAULT 'Olá! Como posso ajudar?',
  color TEXT DEFAULT '#25D366',
  team_id UUID,
  collect_email BOOLEAN DEFAULT false,
  token TEXT UNIQUE NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS ai_summary_at TIMESTAMPTZ;
