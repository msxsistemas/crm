CREATE TABLE public.evolution_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  instance_name text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  owner_jid text,
  profile_pic_url text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, instance_name)
);

ALTER TABLE public.evolution_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own evolution connections"
  ON public.evolution_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);