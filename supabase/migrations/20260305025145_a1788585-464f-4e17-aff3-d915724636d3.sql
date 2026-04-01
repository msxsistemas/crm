-- Delete orphaned kanban board that has no columns (created due to the bug)
DELETE FROM public.kanban_boards 
WHERE id NOT IN (SELECT DISTINCT board_id FROM public.kanban_columns);