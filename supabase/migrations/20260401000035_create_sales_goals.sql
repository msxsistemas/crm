CREATE TABLE IF NOT EXISTS sales_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('conversations','revenue','conversions','nps')),
  target_value NUMERIC NOT NULL,
  current_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, period_month, period_year, goal_type)
);
ALTER TABLE sales_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage goals" ON sales_goals FOR ALL USING (auth.role() = 'authenticated');
