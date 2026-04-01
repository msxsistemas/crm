ALTER TABLE public.chatbot_rules 
ADD COLUMN response_type text NOT NULL DEFAULT 'text',
ADD COLUMN menu_options jsonb DEFAULT '[]'::jsonb;