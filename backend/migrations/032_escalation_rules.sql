-- Migration 032: Escalation Rules + Agent Bio
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;

CREATE TABLE IF NOT EXISTS escalation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  idle_minutes INT NOT NULL DEFAULT 30,
  condition_type TEXT NOT NULL DEFAULT 'idle',
  target_role TEXT NOT NULL DEFAULT 'supervisor',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
