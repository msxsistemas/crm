
-- Rename departments table to categories
ALTER TABLE public.departments RENAME TO categories;

-- Update the RLS policy name
ALTER POLICY "Users can manage own departments" ON public.categories RENAME TO "Users can manage own categories";
