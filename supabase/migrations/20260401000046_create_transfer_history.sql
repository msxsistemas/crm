CREATE TABLE IF NOT EXISTS conversation_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  from_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  from_agent_name TEXT,
  to_agent_name TEXT,
  note TEXT,
  transferred_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE conversation_transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view transfers" ON conversation_transfers FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert transfers" ON conversation_transfers FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE INDEX IF NOT EXISTS idx_transfers_conversation ON conversation_transfers(conversation_id);
