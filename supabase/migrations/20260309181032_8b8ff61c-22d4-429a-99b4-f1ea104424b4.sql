
CREATE TABLE public.system_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value jsonb NOT NULL DEFAULT '""'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage system settings"
ON public.system_settings
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can read system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (true);

-- Insert default settings
INSERT INTO public.system_settings (key, value) VALUES
  ('platform_name', '"ZapCRM"'),
  ('support_email', '""'),
  ('support_phone', '""'),
  ('max_file_size_mb', '10'),
  ('webhook_url', '""'),
  ('maintenance_mode', 'false'),
  ('allow_registration', 'true'),
  ('require_email_verification', 'true'),
  ('welcome_email', 'true'),
  ('plan_expiry_alert', 'true'),
  ('connection_limit_alert', 'true');
