ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority TEXT DEFAULT 'normal';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;
