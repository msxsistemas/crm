CREATE TABLE IF NOT EXISTS event_triggers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('first_contact','birthday','inactivity','tag_added','conversation_closed','campaign_sent')),
  rule_id UUID REFERENCES chatbot_rules(id) ON DELETE SET NULL,
  conditions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  trigger_count INTEGER DEFAULT 0,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE event_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage" ON event_triggers FOR ALL USING (auth.role() = 'authenticated');
