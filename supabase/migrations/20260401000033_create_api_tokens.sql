CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{"read","write"}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE api_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own tokens" ON api_tokens FOR ALL USING (auth.uid() = user_id);
