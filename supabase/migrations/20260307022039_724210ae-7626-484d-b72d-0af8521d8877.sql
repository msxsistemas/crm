-- Allow admins to view all profiles
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all evolution connections
CREATE POLICY "Admins can view all evolution connections"
ON public.evolution_connections
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to view all zapi connections
CREATE POLICY "Admins can view all zapi connections"
ON public.zapi_connections
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));