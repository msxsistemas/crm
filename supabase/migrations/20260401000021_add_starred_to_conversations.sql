ALTER TABLE conversations ADD COLUMN IF NOT EXISTS starred BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_conversations_starred ON conversations(starred) WHERE starred = true;
