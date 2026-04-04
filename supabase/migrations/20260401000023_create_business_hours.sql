CREATE TABLE IF NOT EXISTS business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6), -- 0=Sun, 1=Mon... 6=Sat
  start_time TIME NOT NULL DEFAULT '08:00',
  end_time TIME NOT NULL DEFAULT '18:00',
  active BOOLEAN DEFAULT true,
  UNIQUE(user_id, day_of_week)
);

ALTER TABLE business_hours ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own hours" ON business_hours FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Outside hours message config
CREATE TABLE IF NOT EXISTS business_hours_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN DEFAULT false,
  outside_hours_message TEXT DEFAULT 'Nosso atendimento está fechado no momento. Retornaremos em breve!',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE business_hours_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own config" ON business_hours_config FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
