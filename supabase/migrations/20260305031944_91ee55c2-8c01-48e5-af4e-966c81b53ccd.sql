
INSERT INTO public.kanban_cards (column_id, contact_id, name, phone, position)
SELECT 'b9ccb0df-9880-4972-9edb-b6ca5ee5b364', c.id, COALESCE(c.name, c.phone), c.phone, 0
FROM contacts c
WHERE c.id NOT IN (SELECT contact_id FROM kanban_cards WHERE contact_id IS NOT NULL);
