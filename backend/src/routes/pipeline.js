// Migration SQL (run manually on DB):
// CREATE TABLE IF NOT EXISTS pipeline_stages (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), name TEXT NOT NULL, color TEXT DEFAULT '#3b82f6', position INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW());
// CREATE TABLE IF NOT EXISTS pipeline_deals (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), title TEXT NOT NULL, contact_id UUID REFERENCES contacts(id), stage_id UUID REFERENCES pipeline_stages(id), value NUMERIC DEFAULT 0, notes TEXT, status TEXT DEFAULT 'active', assigned_to UUID REFERENCES profiles(id), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
// INSERT INTO pipeline_stages (name, color, position) VALUES ('Lead','#6366f1',1),('Qualificado','#3b82f6',2),('Proposta','#f59e0b',3),('Negociação','#f97316',4),('Fechado','#22c55e',5) ON CONFLICT DO NOTHING;

import { query } from '../database.js';

export default async function pipelineRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // Pipeline stages CRUD
  fastify.get('/pipeline/stages', auth, async () => {
    const { rows } = await query('SELECT * FROM pipeline_stages ORDER BY position ASC');
    return rows;
  });

  fastify.post('/pipeline/stages', auth, async (req, reply) => {
    const { name, color, position } = req.body;
    const { rows } = await query(
      'INSERT INTO pipeline_stages (name, color, position) VALUES ($1,$2,$3) RETURNING *',
      [name, color || '#3b82f6', position || 999]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.patch('/pipeline/stages/:id', auth, async (req) => {
    const { name, color, position } = req.body;
    const { rows } = await query(
      'UPDATE pipeline_stages SET name=COALESCE($1,name), color=COALESCE($2,color), position=COALESCE($3,position) WHERE id=$4 RETURNING *',
      [name, color, position, req.params.id]
    );
    return rows[0];
  });

  fastify.delete('/pipeline/stages/:id', auth, async (req) => {
    await query('DELETE FROM pipeline_stages WHERE id=$1', [req.params.id]);
    return { ok: true };
  });

  // Pipeline deals CRUD
  fastify.get('/pipeline/deals', auth, async (req) => {
    const { stage_id } = req.query;
    let q = `SELECT d.*, ct.name as contact_name, ct.phone as contact_phone, p.name as agent_name
             FROM pipeline_deals d
             LEFT JOIN contacts ct ON ct.id=d.contact_id
             LEFT JOIN profiles p ON p.id=d.assigned_to`;
    const params = [];
    if (stage_id) { q += ' WHERE d.stage_id=$1'; params.push(stage_id); }
    q += ' ORDER BY d.created_at DESC';
    const { rows } = await query(q, params);
    return rows;
  });

  fastify.post('/pipeline/deals', auth, async (req, reply) => {
    const { title, contact_id, stage_id, value, notes, assigned_to } = req.body;
    const { rows } = await query(
      'INSERT INTO pipeline_deals (title, contact_id, stage_id, value, notes, assigned_to) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [title, contact_id || null, stage_id, value || 0, notes || null, assigned_to || req.user.id]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.patch('/pipeline/deals/:id', auth, async (req) => {
    const { title, stage_id, value, notes, status, assigned_to } = req.body;
    const updates = [];
    const params = [];
    let p = 1;
    if (title !== undefined) { updates.push(`title=$${p}`); params.push(title); p++; }
    if (stage_id !== undefined) { updates.push(`stage_id=$${p}`); params.push(stage_id); p++; }
    if (value !== undefined) { updates.push(`value=$${p}`); params.push(value); p++; }
    if (notes !== undefined) { updates.push(`notes=$${p}`); params.push(notes); p++; }
    if (status !== undefined) { updates.push(`status=$${p}`); params.push(status); p++; }
    if (assigned_to !== undefined) { updates.push(`assigned_to=$${p}`); params.push(assigned_to); p++; }
    if (!updates.length) return { ok: true };
    updates.push(`updated_at=NOW()`);
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE pipeline_deals SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
      params
    );
    return rows[0];
  });

  fastify.delete('/pipeline/deals/:id', auth, async (req) => {
    await query('DELETE FROM pipeline_deals WHERE id=$1', [req.params.id]);
    return { ok: true };
  });
}
