CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  monday_start TEXT, monday_end TEXT, monday_active BOOLEAN DEFAULT TRUE,
  tuesday_start TEXT, tuesday_end TEXT, tuesday_active BOOLEAN DEFAULT TRUE,
  wednesday_start TEXT, wednesday_end TEXT, wednesday_active BOOLEAN DEFAULT TRUE,
  thursday_start TEXT, thursday_end TEXT, thursday_active BOOLEAN DEFAULT TRUE,
  friday_start TEXT, friday_end TEXT, friday_active BOOLEAN DEFAULT TRUE,
  saturday_start TEXT, saturday_end TEXT, saturday_active BOOLEAN DEFAULT FALSE,
  sunday_start TEXT, sunday_end TEXT, sunday_active BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE agent_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Agents manage own schedule" ON agent_schedules FOR ALL USING (auth.uid() = agent_id);
CREATE POLICY "Admins view all schedules" ON agent_schedules FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
