-- Migration 042: Tabela de resumos automáticos de conversa por IA
CREATE TABLE IF NOT EXISTS conversation_summaries (
  id UUID PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
  conversation_id UUID UNIQUE NOT NULL,
  summary TEXT,
  next_steps JSONB DEFAULT '[]'::jsonb,
  suggested_tags JSONB DEFAULT '[]'::jsonb,
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_summaries_conversation_id ON conversation_summaries(conversation_id);
