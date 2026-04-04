CREATE TABLE IF NOT EXISTS contact_forms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB DEFAULT '["name","phone","email"]',
  welcome_message TEXT DEFAULT 'Olá! Preencha seus dados para entrarmos em contato.',
  success_message TEXT DEFAULT 'Obrigado! Seus dados foram recebidos.',
  assign_tag TEXT,
  assign_to UUID REFERENCES auth.users(id),
  redirect_whatsapp BOOLEAN DEFAULT FALSE,
  whatsapp_message TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  submission_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE contact_forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated manage forms"
  ON contact_forms FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Public can view active forms"
  ON contact_forms FOR SELECT
  USING (is_active = TRUE);
