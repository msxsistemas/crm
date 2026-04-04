CREATE TABLE IF NOT EXISTS help_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT DEFAULT 'Geral',
  tags TEXT[], -- array of tag strings
  pinned BOOLEAN DEFAULT false,
  views INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE help_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users manage articles" ON help_articles FOR ALL TO authenticated USING (true) WITH CHECK (true);
