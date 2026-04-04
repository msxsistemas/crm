import { query } from '../database.js';

export default async function taskRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/tasks', auth, async (req) => {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { rows } = await query(`
      SELECT t.*,
        jsonb_build_object('full_name', p1.name) as assigned_profile,
        jsonb_build_object('full_name', p2.name) as creator_profile
      FROM tasks t
      LEFT JOIN profiles p1 ON p1.id = t.assigned_to
      LEFT JOIN profiles p2 ON p2.id = t.user_id
      ORDER BY t.created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    return rows;
  });

  fastify.post('/tasks', auth, async (req, reply) => {
    const { title, description, priority, status, due_date, assigned_to, reminder_minutes, repeat_interval, user_id } = req.body;
    const { rows } = await query(
      'INSERT INTO tasks (title, description, priority, status, due_date, assigned_to, user_id, reminder_minutes, repeat_interval) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *',
      [title, description, priority || 'medium', status || 'pending', due_date, assigned_to, user_id || req.user.id, reminder_minutes, repeat_interval || 'none']
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/tasks/:id', auth, async (req) => {
    const f = req.body;
    const allowed = ['title', 'description', 'priority', 'status', 'due_date', 'assigned_to', 'reminder_minutes'];
    const updates = []; const params = []; let p = 1;
    for (const k of allowed) { if (f[k] !== undefined) { updates.push(`${k}=$${p}`); params.push(f[k]); p++; } }
    if (!updates.length) return {};
    updates.push('updated_at=NOW()');
    params.push(req.params.id);
    const { rows } = await query(`UPDATE tasks SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params);
    return rows[0];
  });

  fastify.delete('/tasks/:id', auth, async (req) => {
    await query('DELETE FROM tasks WHERE id = $1', [req.params.id]);
    return { ok: true };
  });
}
