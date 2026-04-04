-- Schedules table for the Schedules page

CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT NOT NULL DEFAULT '',
  connection_id UUID REFERENCES public.evolution_connections(id) ON DELETE SET NULL,
  queue TEXT,
  message TEXT NOT NULL DEFAULT '',
  send_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  open_ticket BOOLEAN NOT NULL DEFAULT false,
  create_note BOOLEAN NOT NULL DEFAULT false,
  repeat_interval TEXT NOT NULL DEFAULT 'none',
  repeat_daily TEXT NOT NULL DEFAULT 'none',
  repeat_count TEXT NOT NULL DEFAULT 'unlimited',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own schedules"
  ON public.schedules FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_schedules_user_id ON public.schedules(user_id);
CREATE INDEX IF NOT EXISTS idx_schedules_send_at ON public.schedules(send_at);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON public.schedules(status);
