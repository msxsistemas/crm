-- Generic function to auto-update updated_at column
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Apply to tasks
CREATE OR REPLACE TRIGGER set_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Apply to schedules
CREATE OR REPLACE TRIGGER set_schedules_updated_at
  BEFORE UPDATE ON public.schedules
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Apply to internal_conversations
CREATE OR REPLACE TRIGGER set_internal_conversations_updated_at
  BEFORE UPDATE ON public.internal_conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Apply to conversations (if updated_at exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'conversations' AND column_name = 'updated_at'
  ) THEN
    CREATE OR REPLACE TRIGGER set_conversations_updated_at
      BEFORE UPDATE ON public.conversations
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END;
$$;

-- Apply to contacts
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'contacts' AND column_name = 'updated_at'
  ) THEN
    CREATE OR REPLACE TRIGGER set_contacts_updated_at
      BEFORE UPDATE ON public.contacts
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END;
$$;

-- Apply to campaigns
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'campaigns' AND column_name = 'updated_at'
  ) THEN
    CREATE OR REPLACE TRIGGER set_campaigns_updated_at
      BEFORE UPDATE ON public.campaigns
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END;
$$;

-- Apply to profiles
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'updated_at'
  ) THEN
    CREATE OR REPLACE TRIGGER set_profiles_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
  END IF;
END;
$$;
