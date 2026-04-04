CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  event_type TEXT,
  url TEXT,
  status_code INTEGER,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE webhook_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view webhook_logs" ON webhook_logs FOR SELECT USING (auth.role() = 'authenticated');
CREATE INDEX idx_webhook_logs_created_at ON webhook_logs(created_at DESC);
