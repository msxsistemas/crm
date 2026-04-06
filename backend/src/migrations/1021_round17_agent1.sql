-- Round 17 Agent 1: Atalhos personalizáveis + versionamento de notas

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS shortcuts_config JSONB;

CREATE TABLE IF NOT EXISTS note_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id UUID REFERENCES conversation_notes(id) ON DELETE CASCADE,
  content TEXT,
  edited_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_note_versions_note_id ON note_versions(note_id);
