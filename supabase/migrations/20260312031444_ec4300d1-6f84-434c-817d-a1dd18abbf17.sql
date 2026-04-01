ALTER TABLE public.tags 
  ADD COLUMN IF NOT EXISTS tag_type text NOT NULL DEFAULT 'Atendimento',
  ADD COLUMN IF NOT EXISTS kanban_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS priority integer NOT NULL DEFAULT 0;