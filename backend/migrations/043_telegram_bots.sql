-- Migration 043: Tabela de bots Telegram e campo telegram_id em contacts
CREATE TABLE IF NOT EXISTS telegram_bots (
  id UUID PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  webhook_url TEXT,
  active BOOLEAN DEFAULT true,
  org_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_bots_active ON telegram_bots(active);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS telegram_id TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_telegram_id ON contacts(telegram_id);

-- conversations.channel field (may already exist)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel TEXT DEFAULT 'whatsapp';
