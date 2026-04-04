CREATE TABLE IF NOT EXISTS queues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#8B5CF6',
  keywords TEXT, -- comma-separated trigger keywords
  connection TEXT, -- instance_name this queue handles
  max_waiting INTEGER DEFAULT 10,
  auto_assign BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS queue_agents (
  queue_id UUID REFERENCES queues(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  PRIMARY KEY (queue_id, user_id)
);

ALTER TABLE queues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own queues" ON queues FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE queue_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read queue_agents" ON queue_agents FOR ALL TO authenticated USING (true) WITH CHECK (true);
