CREATE TABLE IF NOT EXISTS segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB NOT NULL DEFAULT '[]',
  operator TEXT NOT NULL DEFAULT 'AND' CHECK (operator IN ('AND','OR')),
  contact_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  is_dynamic BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE segments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage segments" ON segments FOR ALL USING (auth.role() = 'authenticated');
