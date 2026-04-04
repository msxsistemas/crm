CREATE TABLE IF NOT EXISTS blacklist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  blocked_by_name TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage blacklist" ON blacklist FOR ALL USING (auth.role() = 'authenticated');
CREATE INDEX idx_blacklist_phone ON blacklist(phone) WHERE is_active = TRUE;
