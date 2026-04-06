-- Recurring campaigns
CREATE TABLE IF NOT EXISTS recurring_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('birthday','followup','date_field')),
  message TEXT NOT NULL,
  connection_name TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  delay_days INT DEFAULT 0,
  custom_field_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS recurring_campaign_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES recurring_campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent'
);

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birth_date DATE;
