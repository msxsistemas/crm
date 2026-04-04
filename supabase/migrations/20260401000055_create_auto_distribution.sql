CREATE TABLE IF NOT EXISTS auto_distribution_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  is_active BOOLEAN DEFAULT FALSE,
  mode TEXT DEFAULT 'round_robin' CHECK (mode IN ('round_robin', 'least_loaded', 'random')),
  respect_working_hours BOOLEAN DEFAULT TRUE,
  respect_queues BOOLEAN DEFAULT TRUE,
  max_conversations_per_agent INTEGER DEFAULT 10,
  include_agent_ids UUID[] DEFAULT '{}',
  exclude_agent_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE auto_distribution_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage distribution" ON auto_distribution_config FOR ALL USING (auth.role() = 'authenticated');

-- Track round-robin state
CREATE TABLE IF NOT EXISTS distribution_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,
  mode_used TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE distribution_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated view distribution_log" ON distribution_log FOR SELECT USING (auth.role() = 'authenticated');

-- Custom reports table
CREATE TABLE IF NOT EXISTS custom_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  layout JSONB NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE custom_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage custom_reports" ON custom_reports FOR ALL USING (auth.role() = 'authenticated');
