CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT, -- 'conversation', 'contact', 'task', 'campaign', 'chatbot_rule', 'user', etc.
  entity_id TEXT,
  entity_name TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read activity" ON activity_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages activity" ON activity_log FOR ALL TO service_role USING (true);
CREATE POLICY "Authenticated insert activity" ON activity_log FOR INSERT TO authenticated WITH CHECK (true);
