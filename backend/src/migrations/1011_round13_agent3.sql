CREATE TABLE IF NOT EXISTS payment_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id),
  amount NUMERIC(10,2),
  description TEXT,
  provider TEXT DEFAULT 'manual',
  external_url TEXT,
  status TEXT DEFAULT 'pending',
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ai_routing_enabled BOOLEAN DEFAULT false;
