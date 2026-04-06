-- Productivity goals
CREATE TABLE IF NOT EXISTS productivity_goals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  daily_conversations INT DEFAULT 10,
  weekly_conversations INT DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
