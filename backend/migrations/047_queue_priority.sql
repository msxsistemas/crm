-- Migration 047: Queue Priority Rules + Conversation Priority + Intent Category

-- Tabela de regras de prioridade de fila
CREATE TABLE IF NOT EXISTS queue_priority_rules (
  id UUID PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text)::uuid,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL CHECK (condition_type IN ('lead_score_above','csat_above','tag_contains','is_returning')),
  condition_value TEXT NOT NULL DEFAULT '0',
  priority_boost INT NOT NULL DEFAULT 10,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Adicionar coluna priority em conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS priority INT NOT NULL DEFAULT 0;

-- Adicionar coluna intent_category em conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS intent_category TEXT;

-- Index para ordenação por prioridade
CREATE INDEX IF NOT EXISTS idx_conversations_priority ON conversations (priority DESC, last_message_at DESC);
