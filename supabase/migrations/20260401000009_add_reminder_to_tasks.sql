ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER;
