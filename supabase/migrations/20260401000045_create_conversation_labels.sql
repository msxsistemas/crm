CREATE TABLE IF NOT EXISTS conversation_labels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS label_ids UUID[] DEFAULT '{}';

ALTER TABLE conversation_labels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated manage labels" ON conversation_labels FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO conversation_labels (name, color) VALUES
  ('Suporte', '#3b82f6'),
  ('Venda', '#22c55e'),
  ('Reclamação', '#ef4444'),
  ('Financeiro', '#f59e0b'),
  ('Urgente', '#dc2626'),
  ('Dúvida', '#8b5cf6')
ON CONFLICT (name) DO NOTHING;
