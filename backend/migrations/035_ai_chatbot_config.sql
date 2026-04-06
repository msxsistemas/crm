-- Migration 035: AI Chatbot Config
CREATE TABLE IF NOT EXISTS ai_chatbot_config (
  id SERIAL PRIMARY KEY,
  enabled BOOLEAN DEFAULT false,
  system_prompt TEXT,
  max_history_messages INT DEFAULT 10,
  trigger_keywords TEXT[] DEFAULT '{}',
  handoff_keywords TEXT[] DEFAULT ARRAY['humano', 'atendente', 'pessoa', 'falar com alguém', 'falar com humano'],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO ai_chatbot_config (id, enabled, system_prompt, max_history_messages)
VALUES (1, false, 'Você é um assistente virtual prestativo. Responda de forma clara e educada em português.', 10)
ON CONFLICT (id) DO NOTHING;
