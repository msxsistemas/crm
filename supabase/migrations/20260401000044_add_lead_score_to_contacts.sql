ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_score_updated_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS lead_scoring_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('has_tag','campaign_opened','has_conversation','inactivity_days','has_opportunity','opportunity_stage','message_count','custom_field')),
  condition_value TEXT,
  points INTEGER NOT NULL DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE lead_scoring_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage scoring rules" ON lead_scoring_rules FOR ALL USING (auth.role() = 'authenticated');

-- Default rules
INSERT INTO lead_scoring_rules (name, condition_type, condition_value, points) VALUES
  ('Respondeu campanha', 'campaign_opened', null, 10),
  ('Tem conversa ativa', 'has_conversation', 'open', 15),
  ('Tem oportunidade aberta', 'has_opportunity', 'open', 20),
  ('Oportunidade em negociação', 'opportunity_stage', 'negotiation', 25),
  ('Inativo há 30+ dias', 'inactivity_days', '30', -15),
  ('Inativo há 60+ dias', 'inactivity_days', '60', -25),
  ('Mais de 10 mensagens', 'message_count', '10', 10);
