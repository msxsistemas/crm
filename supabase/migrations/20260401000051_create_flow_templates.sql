CREATE TABLE IF NOT EXISTS attendance_flow_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB NOT NULL DEFAULT '[]',
  created_by UUID REFERENCES auth.users(id),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE attendance_flow_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage templates" ON attendance_flow_templates FOR ALL USING (auth.role() = 'authenticated');
