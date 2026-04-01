CREATE TABLE public.zapi_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  label text NOT NULL,
  instance_id text NOT NULL,
  instance_token text NOT NULL,
  client_token text NOT NULL,
  status text NOT NULL DEFAULT 'disconnected',
  connected boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.zapi_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own zapi connections"
  ON public.zapi_connections
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);