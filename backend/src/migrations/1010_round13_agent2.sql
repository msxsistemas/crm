CREATE TABLE IF NOT EXISTS team_routing (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
  connection_name TEXT,
  priority INTEGER DEFAULT 1,
  active_days INTEGER[] DEFAULT '{0,1,2,3,4,5,6}',
  start_time TEXT DEFAULT '00:00',
  end_time TEXT DEFAULT '23:59',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  changed_fields JSONB,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS session_timeout_minutes INTEGER DEFAULT 30;
