CREATE TABLE IF NOT EXISTS email_notification_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  on_new_conversation BOOLEAN DEFAULT true,
  on_sla_expiring BOOLEAN DEFAULT true,
  on_mention BOOLEAN DEFAULT true,
  email_override TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_notification_settings_user_id ON email_notification_settings(user_id);
