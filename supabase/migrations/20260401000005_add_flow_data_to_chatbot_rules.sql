-- Add flow_data column to chatbot_rules for storing visual flow nodes
ALTER TABLE public.chatbot_rules
  ADD COLUMN IF NOT EXISTS flow_data JSONB;
