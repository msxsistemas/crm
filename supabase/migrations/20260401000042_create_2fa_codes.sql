CREATE TABLE IF NOT EXISTS two_factor_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE two_factor_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own 2fa codes" ON two_factor_codes FOR ALL USING (auth.uid() = user_id);

-- Add 2fa_enabled to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT FALSE;
