CREATE TABLE IF NOT EXISTS hsm_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('UTILITY','MARKETING','AUTHENTICATION')),
  language TEXT NOT NULL DEFAULT 'pt_BR',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','disabled')),
  header_type TEXT CHECK (header_type IN ('TEXT','IMAGE','VIDEO','DOCUMENT')),
  header_content TEXT,
  body TEXT NOT NULL,
  footer TEXT,
  buttons JSONB DEFAULT '[]',
  variables TEXT[] DEFAULT '{}',
  rejection_reason TEXT,
  whatsapp_template_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE hsm_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage hsm_templates" ON hsm_templates
  FOR ALL USING (auth.role() = 'authenticated');

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_hsm_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hsm_templates_updated_at
  BEFORE UPDATE ON hsm_templates
  FOR EACH ROW EXECUTE FUNCTION update_hsm_templates_updated_at();
