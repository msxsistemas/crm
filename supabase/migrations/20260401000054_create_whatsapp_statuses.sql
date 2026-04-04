CREATE TABLE IF NOT EXISTS whatsapp_statuses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text','image','video')),
  content TEXT,
  caption TEXT,
  background_color TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE whatsapp_statuses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage statuses" ON whatsapp_statuses FOR ALL USING (auth.role() = 'authenticated');
