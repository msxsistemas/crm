-- Migration 041: Tracked Links
CREATE TABLE IF NOT EXISTS tracked_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  original_url TEXT NOT NULL,
  short_code TEXT UNIQUE NOT NULL,
  campaign_id UUID,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS link_clicks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  link_id UUID REFERENCES tracked_links(id) ON DELETE CASCADE,
  clicked_at TIMESTAMPTZ DEFAULT NOW(),
  user_agent TEXT,
  ip TEXT
);

CREATE INDEX IF NOT EXISTS idx_link_clicks_link_id ON link_clicks(link_id);
CREATE INDEX IF NOT EXISTS idx_tracked_links_short_code ON tracked_links(short_code);
