DELETE FROM conversations 
WHERE id IN (
  SELECT c.id FROM conversations c
  JOIN (
    SELECT contact_id, instance_name 
    FROM conversations 
    WHERE status = 'open'
  ) open_convos ON c.contact_id = open_convos.contact_id 
    AND c.instance_name = open_convos.instance_name
  WHERE c.status = 'closed'
);