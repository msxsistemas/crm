CREATE TABLE IF NOT EXISTS custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  field_type TEXT DEFAULT 'text',
  options JSONB DEFAULT '[]',
  required BOOLEAN DEFAULT false,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_custom_values (
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  field_id UUID REFERENCES custom_field_definitions(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY(contact_id, field_id)
);
