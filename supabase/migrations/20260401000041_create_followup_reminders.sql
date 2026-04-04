CREATE TABLE IF NOT EXISTS followup_reminders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  reminder_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed','completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE followup_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents manage own reminders" ON followup_reminders FOR ALL USING (auth.uid() = agent_id);
CREATE INDEX idx_reminders_agent ON followup_reminders(agent_id, status, reminder_at);
