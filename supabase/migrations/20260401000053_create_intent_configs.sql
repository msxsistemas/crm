CREATE TABLE IF NOT EXISTS intent_configs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  examples TEXT[] DEFAULT '{}',
  route_to_rule_id UUID REFERENCES chatbot_rules(id) ON DELETE SET NULL,
  route_to_queue_id UUID REFERENCES queues(id) ON DELETE SET NULL,
  confidence_threshold NUMERIC DEFAULT 0.7,
  is_active BOOLEAN DEFAULT TRUE,
  match_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE intent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage intents" ON intent_configs FOR ALL USING (auth.role() = 'authenticated');
