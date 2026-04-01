
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS goodbye_message text,
  ADD COLUMN IF NOT EXISTS absence_message text,
  ADD COLUMN IF NOT EXISTS follow_me_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS start_time text,
  ADD COLUMN IF NOT EXISTS end_time text,
  ADD COLUMN IF NOT EXISTS limited_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_inactive boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS contacts_access boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS campaigns_access boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_create_tags boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS default_connection_id uuid;
