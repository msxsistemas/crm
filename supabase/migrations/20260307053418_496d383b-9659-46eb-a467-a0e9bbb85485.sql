
CREATE TABLE public.gateway_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gateway_name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (gateway_name)
);

ALTER TABLE public.gateway_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage gateway configs"
ON public.gateway_configs
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view gateway configs"
ON public.gateway_configs
FOR SELECT
TO authenticated
USING (true);
