CREATE TABLE IF NOT EXISTS scheduled_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  report_type TEXT NOT NULL CHECK (report_type IN ('daily_summary','weekly_performance','monthly_overview','sla_breach','agent_performance')),
  frequency TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  day_of_week INTEGER, -- 0=Sunday, 1=Monday... for weekly
  day_of_month INTEGER, -- 1-31 for monthly
  send_time TEXT DEFAULT '08:00',
  recipients TEXT[] NOT NULL,
  filters JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMPTZ,
  next_send_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage scheduled_reports" ON scheduled_reports FOR ALL USING (auth.role() = 'authenticated');
