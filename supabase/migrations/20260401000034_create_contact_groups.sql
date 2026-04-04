CREATE TABLE IF NOT EXISTS contact_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  icon TEXT DEFAULT 'users',
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_group_members (
  group_id UUID REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, contact_id)
);

ALTER TABLE contact_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage groups" ON contact_groups FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated manage members" ON contact_group_members FOR ALL USING (auth.role() = 'authenticated');
