CREATE TABLE IF NOT EXISTS sla_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  first_response_minutes INTEGER NOT NULL DEFAULT 60,
  resolution_minutes INTEGER NOT NULL DEFAULT 480,
  warning_threshold INTEGER NOT NULL DEFAULT 80,
  applies_to_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE sla_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can manage sla_rules" ON sla_rules FOR ALL USING (auth.role() = 'authenticated');
