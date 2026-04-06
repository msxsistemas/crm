ALTER TABLE settings ADD COLUMN IF NOT EXISTS queue_message_enabled BOOLEAN DEFAULT false;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS queue_message_text TEXT DEFAULT 'Olá! Você é o {{posicao}}º da fila. Tempo estimado: {{tempo}} minutos.';

CREATE TABLE IF NOT EXISTS sla_category_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_name TEXT NOT NULL UNIQUE,
  sla_hours NUMERIC(5,1) NOT NULL DEFAULT 24,
  priority TEXT DEFAULT 'normal',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
