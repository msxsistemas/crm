-- Migration 040: Custom Surveys
CREATE TABLE IF NOT EXISTS custom_surveys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  questions JSONB DEFAULT '[]',
  trigger_on_close BOOLEAN DEFAULT false,
  connection_name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  survey_id UUID REFERENCES custom_surveys(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  answers JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
