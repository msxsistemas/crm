-- Fix tasks RLS: users should also see tasks assigned to them
DROP POLICY IF EXISTS "Users can manage own tasks" ON public.tasks;

-- SELECT: creator or assigned user can see the task
CREATE POLICY "Users can view own and assigned tasks"
  ON public.tasks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_to);

-- INSERT: only creator
CREATE POLICY "Users can insert own tasks"
  ON public.tasks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- UPDATE: creator or assigned user
CREATE POLICY "Users can update own and assigned tasks"
  ON public.tasks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR auth.uid() = assigned_to)
  WITH CHECK (auth.uid() = user_id OR auth.uid() = assigned_to);

-- DELETE: only creator
CREATE POLICY "Users can delete own tasks"
  ON public.tasks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
