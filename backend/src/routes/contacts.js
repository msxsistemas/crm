import { query } from '../database.js';

export default async function contactRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // List contacts
  fastify.get('/contacts', auth, async (req) => {
    const { search, tag, page = 1, limit = 50, sort = 'created_at', order = 'desc' } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['1=1'];
    const params = [];
    let p = 1;

    if (search) {
      conditions.push(`(name ILIKE $${p} OR phone ILIKE $${p} OR email ILIKE $${p})`);
      params.push(`%${search}%`); p++;
    }
    if (tag) {
      conditions.push(`$${p} = ANY(tags)`);
      params.push(tag); p++;
    }

    const where = conditions.join(' AND ');
    const [{ rows }, { rows: countRows }] = await Promise.all([
      query(`SELECT * FROM contacts WHERE ${where} ORDER BY ${sort} ${order} LIMIT $${p} OFFSET $${p+1}`, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM contacts WHERE ${where}`, params),
    ]);

    return { data: rows, total: parseInt(countRows[0].count), page: +page, limit: +limit };
  });

  // Get single contact
  fastify.get('/contacts/:id', auth, async (req, reply) => {
    const { rows } = await query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Contato não encontrado' });
    return rows[0];
  });

  // Create contact
  fastify.post('/contacts', auth, async (req, reply) => {
    const { name, phone, email, tags = [], notes, birthday, custom_fields = {} } = req.body;
    if (!name || !phone) return reply.status(400).send({ error: 'Nome e telefone obrigatórios' });

    // Check duplicate
    const dup = await query('SELECT id, name FROM contacts WHERE phone = $1 LIMIT 1', [phone]);
    if (dup.rows[0]) return reply.status(409).send({ error: 'Telefone já cadastrado', existing: dup.rows[0] });

    const { rows } = await query(
      'INSERT INTO contacts (name, phone, email, tags, notes, birthday, custom_fields) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [name, phone, email, tags, notes, birthday, JSON.stringify(custom_fields)]
    );
    return reply.status(201).send(rows[0]);
  });

  // Update contact
  fastify.patch('/contacts/:id', auth, async (req, reply) => {
    const fields = ['name','phone','email','tags','notes','birthday','custom_fields','lead_score'];
    const updates = [];
    const params = [];
    let p = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = $${p}`);
        params.push(f === 'custom_fields' ? JSON.stringify(req.body[f]) : req.body[f]);
        p++;
      }
    }
    if (!updates.length) return reply.status(400).send({ error: 'Nenhum campo para atualizar' });
    updates.push(`updated_at = NOW()`);
    params.push(req.params.id);

    const { rows } = await query(`UPDATE contacts SET ${updates.join(',')} WHERE id = $${p} RETURNING *`, params);
    if (!rows[0]) return reply.status(404).send({ error: 'Contato não encontrado' });
    return rows[0];
  });

  // Delete contact
  fastify.delete('/contacts/:id', auth, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.status(404).send({ error: 'Contato não encontrado' });
    return { message: 'Contato excluído' };
  });

  // Bulk import CSV
  fastify.post('/contacts/bulk', auth, async (req, reply) => {
    const { contacts } = req.body;
    if (!Array.isArray(contacts)) return reply.status(400).send({ error: 'Array de contatos obrigatório' });

    let imported = 0, skipped = 0, errors = 0;
    for (const c of contacts) {
      try {
        const dup = await query('SELECT id FROM contacts WHERE phone = $1', [c.phone]);
        if (dup.rows[0]) { skipped++; continue; }
        await query('INSERT INTO contacts (name, phone, email, tags) VALUES ($1,$2,$3,$4)', [c.name, c.phone, c.email, c.tags || []]);
        imported++;
      } catch { errors++; }
    }
    return { imported, skipped, errors };
  });
}
