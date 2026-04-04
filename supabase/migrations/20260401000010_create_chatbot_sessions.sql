-- Table to track flow execution state per conversation
CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES chatbot_rules(id) ON DELETE CASCADE,
  current_node_id TEXT NOT NULL,
  variables JSONB DEFAULT '{}'::jsonb,
  waiting_for_input BOOLEAN DEFAULT false,
  input_variable TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chatbot_sessions_conversation_idx ON chatbot_sessions(conversation_id);

ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access" ON chatbot_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
