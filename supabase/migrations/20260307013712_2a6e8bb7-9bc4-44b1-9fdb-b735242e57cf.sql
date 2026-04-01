
-- 1. Role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'reseller', 'user');

-- 2. User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- 3. Security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- 4. RLS policies for user_roles
CREATE POLICY "Users can view own roles" ON public.user_roles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5. Reseller plans table (admin creates these)
CREATE TABLE public.reseller_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC NOT NULL DEFAULT 0,
  max_connections INT NOT NULL DEFAULT 1,
  max_users INT NOT NULL DEFAULT 3,
  max_campaigns INT NOT NULL DEFAULT 5,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reseller_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can view active plans" ON public.reseller_plans
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage plans" ON public.reseller_plans
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Reseller accounts (links a user to a plan + branding)
CREATE TABLE public.reseller_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  plan_id UUID REFERENCES public.reseller_plans(id),
  company_name TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#7C3AED',
  is_active BOOLEAN NOT NULL DEFAULT true,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reseller_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers can view own account" ON public.reseller_accounts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Resellers can update own account" ON public.reseller_accounts
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all reseller accounts" ON public.reseller_accounts
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 7. Sub-users table (reseller creates sub-users)
CREATE TABLE public.reseller_sub_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  sub_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (reseller_id, sub_user_id)
);
ALTER TABLE public.reseller_sub_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers can manage own sub-users" ON public.reseller_sub_users
  FOR ALL USING (auth.uid() = reseller_id)
  WITH CHECK (auth.uid() = reseller_id);

CREATE POLICY "Admins can manage all sub-users" ON public.reseller_sub_users
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 8. Financial transactions
CREATE TABLE public.reseller_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reseller_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount NUMERIC NOT NULL,
  type TEXT NOT NULL DEFAULT 'payment',
  status TEXT NOT NULL DEFAULT 'pending',
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reseller_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Resellers can view own transactions" ON public.reseller_transactions
  FOR SELECT USING (auth.uid() = reseller_id);

CREATE POLICY "Admins can manage all transactions" ON public.reseller_transactions
  FOR ALL USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
