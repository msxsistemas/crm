
-- Campaigns table
CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  message_template text,
  status text NOT NULL DEFAULT 'draft',
  send_speed integer NOT NULL DEFAULT 20,
  total_sent integer NOT NULL DEFAULT 0,
  delivered integer NOT NULL DEFAULT 0,
  read integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own campaigns" ON public.campaigns FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User activity logs table
CREATE TABLE public.user_activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_name text,
  action text NOT NULL,
  ip_address text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view logs" ON public.user_activity_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can insert own logs" ON public.user_activity_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Kanban boards
CREATE TABLE public.kanban_boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kanban_boards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own boards" ON public.kanban_boards FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Kanban columns
CREATE TABLE public.kanban_columns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id uuid NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT '#6366f1',
  position integer NOT NULL DEFAULT 0,
  is_default boolean NOT NULL DEFAULT false,
  is_finalized boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage columns via board" ON public.kanban_columns FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.kanban_boards WHERE id = board_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.kanban_boards WHERE id = board_id AND user_id = auth.uid()));

-- Kanban cards (contacts in columns)
CREATE TABLE public.kanban_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  column_id uuid NOT NULL REFERENCES public.kanban_columns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  name text NOT NULL,
  phone text,
  position integer NOT NULL DEFAULT 0,
  value numeric DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage cards via board" ON public.kanban_cards FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kanban_columns c 
    JOIN public.kanban_boards b ON c.board_id = b.id 
    WHERE c.id = column_id AND b.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.kanban_columns c 
    JOIN public.kanban_boards b ON c.board_id = b.id 
    WHERE c.id = column_id AND b.user_id = auth.uid()
  ));
