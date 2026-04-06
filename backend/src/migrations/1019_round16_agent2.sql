ALTER TABLE conversations ADD COLUMN IF NOT EXISTS tags TEXT[];

CREATE TABLE IF NOT EXISTS integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  events JSONB DEFAULT '[]',
  secret_token TEXT,
  platform TEXT DEFAULT 'generic',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
