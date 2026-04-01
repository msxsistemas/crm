ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS conversations_status_check;

ALTER TABLE public.conversations
ADD CONSTRAINT conversations_status_check
CHECK (status = ANY (ARRAY['open'::text, 'attending'::text, 'closed'::text, 'archived'::text]));