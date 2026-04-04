CREATE TABLE IF NOT EXISTS chatbot_node_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID REFERENCES chatbot_rules(id) ON DELETE CASCADE,
  session_id UUID,
  node_id TEXT NOT NULL,
  node_type TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('entered','exited','abandoned','error')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE chatbot_node_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view" ON chatbot_node_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE INDEX idx_node_events_rule ON chatbot_node_events(rule_id);
