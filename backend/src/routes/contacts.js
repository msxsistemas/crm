import { query } from '../database.js';
import { cached, invalidate } from '../redis.js';

export default async function contactRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // List contacts
  fastify.get('/contacts', auth, async (req) => {
    const { search, tag, page = 1, limit = 50, order } = req.query;
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

    // order param: 'name' = ASC, '-name' = DESC, default = created_at DESC
    const ALLOWED_COLS = ['name','phone','email','created_at','updated_at','lead_score'];
    let orderClause = 'created_at DESC';
    if (order) {
      const desc = order.startsWith('-');
      const col = desc ? order.slice(1) : order;
      if (ALLOWED_COLS.includes(col)) orderClause = `"${col}" ${desc ? 'DESC' : 'ASC'}`;
    }

    const where = conditions.join(' AND ');
    const cacheKey = !search && !tag
      ? `contacts:list:${orderClause}:${page}:${limit}`
      : null;

    const fetchData = () => Promise.all([
      query(`SELECT * FROM contacts WHERE ${where} ORDER BY ${orderClause} LIMIT $${p} OFFSET $${p+1}`, [...params, limit, offset]),
      query(`SELECT COUNT(*) FROM contacts WHERE ${where}`, params),
    ]).then(([{ rows }, { rows: countRows }]) => ({ data: rows, total: parseInt(countRows[0].count), page: +page, limit: +limit }));

    const result = cacheKey
      ? await cached(cacheKey, 30, fetchData)
      : await fetchData();

    return result;
  });

  // Get single contact
  fastify.get('/contacts/:id', auth, async (req, reply) => {
    const { rows } = await query('SELECT * FROM contacts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Contato não encontrado' });
    return rows[0];
  });

  // Create contact
  fastify.post('/contacts', {
    preHandler: fastify.authenticate,
    schema: {
      body: {
        type: 'object',
        required: ['name', 'phone'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          phone: { type: 'string', minLength: 5, maxLength: 30 },
          email: { type: 'string', format: 'email', maxLength: 254, nullable: true },
          tags: { type: 'array', items: { type: 'string' } },
          notes: { type: 'string', maxLength: 5000, nullable: true },
          birthday: { type: 'string', nullable: true },
          custom_fields: { type: 'object' },
        },
      },
    },
  }, async (req, reply) => {
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
    const fields = ['name','phone','email','tags','notes','birthday','custom_fields','lead_score','disable_chatbot','avatar_url'];
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
    invalidate('contacts:list:*').catch(() => {});
    return rows[0];
  });

  // Delete contact
  fastify.delete('/contacts/:id', auth, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.status(404).send({ error: 'Contato não encontrado' });
    return { message: 'Contato excluído' };
  });

  // Sync avatars from Evolution API for contacts without avatar_url
  fastify.post('/contacts/sync-avatars', auth, async (req, reply) => {
    const { rows: settings } = await query('SELECT evolution_url, evolution_key FROM settings WHERE id=1');
    const s = settings[0];
    if (!s?.evolution_url) return reply.status(400).send({ error: 'Evolution API não configurada' });

    // Get Evolution instance name
    const { rows: instances } = await query("SELECT instance_name FROM evolution_connections WHERE status='open' LIMIT 1");
    const instance = instances[0]?.instance_name;
    if (!instance) return reply.status(400).send({ error: 'Nenhuma instância conectada' });

    // Get contacts without avatar
    const { rows: contacts } = await query('SELECT id, phone FROM contacts WHERE avatar_url IS NULL AND phone IS NOT NULL LIMIT 50');
    let updated = 0;

    for (const contact of contacts) {
      try {
        const res = await fetch(`${s.evolution_url}/chat/fetchProfilePictureUrl/${instance}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': s.evolution_key },
          body: JSON.stringify({ number: contact.phone }),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const picUrl = data?.profilePictureUrl;
        if (picUrl) {
          await query('UPDATE contacts SET avatar_url=$1 WHERE id=$2', [picUrl, contact.id]);
          updated++;
        }
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 200));
      } catch {}
    }
    return { updated, total: contacts.length };
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
