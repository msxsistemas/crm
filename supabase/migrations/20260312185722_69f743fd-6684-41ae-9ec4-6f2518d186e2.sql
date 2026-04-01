INSERT INTO public.user_roles (user_id, role)
VALUES ('c7a49b3a-4d28-4827-80e0-ed4667060c80', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;