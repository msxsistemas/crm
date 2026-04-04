-- Internal chat tables

CREATE TABLE IF NOT EXISTS public.internal_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.internal_conversation_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.internal_conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.internal_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.internal_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_messages ENABLE ROW LEVEL SECURITY;

-- Users can see conversations they participate in
CREATE POLICY "Participants can view conversation"
  ON public.internal_conversations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_conversation_participants p
      WHERE p.conversation_id = id AND p.user_id = auth.uid()
    ) OR created_by = auth.uid()
  );

CREATE POLICY "Authenticated can create conversations"
  ON public.internal_conversations FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creator can update/delete conversations"
  ON public.internal_conversations FOR DELETE TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "Participants can view"
  ON public.internal_conversation_participants FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.internal_conversations c
    WHERE c.id = conversation_id AND c.created_by = auth.uid()
  ));

CREATE POLICY "Authenticated can add participants"
  ON public.internal_conversation_participants FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "Participants can view messages"
  ON public.internal_messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.internal_conversation_participants p
      WHERE p.conversation_id = internal_messages.conversation_id AND p.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated can send messages"
  ON public.internal_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = sender_id);

-- Add to realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_conversations;

CREATE INDEX IF NOT EXISTS idx_internal_messages_conv ON public.internal_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_internal_participants_user ON public.internal_conversation_participants(user_id);
