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
    // Save version before updating
    const { rows: current } = await query('SELECT * FROM contacts WHERE id=$1', [req.params.id]);
    if (current[0]) {
      const changed = {};
      const versionFields = ['name','phone','email','organization','tags','notes'];
      for (const f of versionFields) {
        if (req.body[f] !== undefined && JSON.stringify(req.body[f]) !== JSON.stringify(current[0][f])) {
          changed[f] = { old: current[0][f], new: req.body[f] };
        }
      }
      if (Object.keys(changed).length > 0) {
        await query(
          'INSERT INTO contact_versions (contact_id, changed_fields, changed_by) VALUES ($1,$2,$3)',
          [req.params.id, JSON.stringify(changed), req.user?.id]
        ).catch(() => {});
      }
    }

    const fields = ['name','phone','email','tags','notes','birthday','custom_fields','lead_score','disable_chatbot','avatar_url','cep','street','address_number','complement','neighborhood','city','state'];
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

  // Contact version history
  fastify.get('/contacts/:id/history', auth, async (req, reply) => {
    const { rows } = await query(
      `SELECT cv.*, p.name as changed_by_name
       FROM contact_versions cv
       LEFT JOIN profiles p ON p.id=cv.changed_by
       WHERE cv.contact_id=$1
       ORDER BY cv.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    return rows;
  });

  // Delete contact
  fastify.delete('/contacts/:id', auth, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM contacts WHERE id = $1', [req.params.id]);
    if (!rowCount) return reply.status(404).send({ error: 'Contato não encontrado' });
    return { message: 'Contato excluído' };
  });

  // Contact stats (for recurrent badge)
  fastify.get('/contacts/:id/stats', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query(`
      SELECT
        COUNT(c.id) as total_conversations,
        COUNT(c.id) FILTER (WHERE c.status='closed') as closed_conversations,
        MIN(c.created_at) as first_contact,
        MAX(c.created_at) as last_contact,
        ROUND(AVG(c.csat_score)::numeric, 2) as avg_csat,
        COUNT(c.id) FILTER (WHERE c.created_at > NOW() - interval '30 days') as conversations_last_30d
      FROM conversations c WHERE c.contact_id=$1
    `, [req.params.id]);
    return rows[0] || {};
  });

  // Block / unblock contact
  fastify.patch('/contacts/:id/block', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { blocked, block_reason } = req.body;
    await query('UPDATE contacts SET is_blocked=$1, block_reason=$2, blocked_at=$3 WHERE id=$4',
      [blocked, blocked ? (block_reason || null) : null, blocked ? new Date() : null, req.params.id]);
    return { success: true };
  });

  // Import WhatsApp chat history (.txt export)
  fastify.post('/contacts/:id/import-chat-history', auth, async (req, reply) => {
    const { content, instance_name } = req.body;
    if (!content) return reply.code(400).send({ error: 'content é obrigatório' });

    const contactId = req.params.id;

    // Get or create conversation for this contact
    const { rows: convs } = await query(
      "SELECT id FROM conversations WHERE contact_id=$1 AND status='closed' ORDER BY created_at DESC LIMIT 1",
      [contactId]
    );

    let conversationId;
    if (convs[0]) {
      conversationId = convs[0].id;
    } else {
      const { rows: contact } = await query('SELECT * FROM contacts WHERE id=$1', [contactId]);
      if (!contact[0]) return reply.code(404).send({ error: 'Contact not found' });
      const { rows: newConv } = await query(
        "INSERT INTO conversations (contact_id, status, instance_name, created_at) VALUES ($1,'closed',$2,NOW()) RETURNING id",
        [contactId, instance_name || 'imported']
      );
      conversationId = newConv[0].id;
    }

    // Parse WhatsApp export format: "DD/MM/YYYY, HH:MM - Name: message"
    const lines = content.split('\n');
    const msgRegex = /^(\d{1,2}\/\d{1,2}\/\d{2,4}),\s(\d{2}:\d{2})\s-\s([^:]+):\s(.+)$/;

    let imported = 0;
    const contactInfo = await query('SELECT name, phone FROM contacts WHERE id=$1', [contactId]);
    const contactName = contactInfo.rows[0]?.name || '';
    const contactPhone = contactInfo.rows[0]?.phone || '';

    for (const line of lines) {
      const match = line.match(msgRegex);
      if (!match) continue;

      const [, dateStr, timeStr, sender, message] = match;
      // Determine direction: if sender matches contact name or phone → inbound, else outbound
      const isContact = sender.includes(contactName) || sender.includes(contactPhone) || sender === contactName;
      const direction = isContact ? 'inbound' : 'outbound';

      // Parse date
      const [day, month, year] = dateStr.split('/');
      const msgDate = new Date(`${year}-${month}-${day}T${timeStr}:00`);

      try {
        await query(
          "INSERT INTO messages (conversation_id, direction, body, message_type, created_at, status) VALUES ($1,$2,$3,'conversation',$4,'read') ON CONFLICT DO NOTHING",
          [conversationId, direction, message, msgDate]
        );
        imported++;
      } catch(e) { /* skip duplicate */ }
    }

    // Update conversation last_message_at
    if (imported > 0) {
      await query('UPDATE conversations SET last_message_at=NOW() WHERE id=$1', [conversationId]);
    }

    return { ok: true, imported, conversation_id: conversationId };
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

  // Contact unified profile
  fastify.get('/contacts/:id/profile', auth, async (req, reply) => {
    const { rows: contact } = await query('SELECT * FROM contacts WHERE id=$1', [req.params.id]);
    if (!contact[0]) return reply.code(404).send({ error: 'Not found' });

    const [convs, notes, csatData] = await Promise.all([
      query(`SELECT c.id, c.status, c.created_at, c.closed_at, c.last_message_body, c.last_message_at, c.csat_score, p.name as agent_name, cat.name as category_name FROM conversations c LEFT JOIN profiles p ON p.id=c.assigned_to LEFT JOIN categories cat ON cat.id=c.category_id WHERE c.contact_id=$1 ORDER BY c.created_at DESC`, [req.params.id]),
      query(`SELECT n.*, p.name as author_name FROM conversation_notes n JOIN profiles p ON p.id=n.author_id JOIN conversations c ON c.id=n.conversation_id WHERE c.contact_id=$1 ORDER BY n.created_at DESC LIMIT 20`, [req.params.id]),
      query(`SELECT ROUND(AVG(csat_score)::numeric,2) as avg_csat, COUNT(*) FILTER (WHERE csat_score IS NOT NULL) as csat_count FROM conversations WHERE contact_id=$1`, [req.params.id])
    ]);

    return {
      contact: contact[0],
      conversations: convs.rows,
      notes: notes.rows,
      csat: csatData.rows[0],
      stats: {
        total_conversations: convs.rows.length,
        open_conversations: convs.rows.filter(c => c.status === 'open').length,
        avg_csat: csatData.rows[0]?.avg_csat
      }
    };
  });

  // Contact conversation history
  fastify.get('/contacts/:id/conversations', auth, async (req) => {
    const { rows } = await query(`
      SELECT c.id, c.status, c.created_at, c.closed_at, c.last_message_body, c.last_message_at,
             c.csat_score, p.name as agent_name, cat.name as category_name
      FROM conversations c
      LEFT JOIN profiles p ON p.id = c.assigned_to
      LEFT JOIN categories cat ON cat.id = c.category_id
      WHERE c.contact_id = $1
      ORDER BY c.created_at DESC
      LIMIT 50
    `, [req.params.id]);
    return rows;
  });

  // Detect duplicate contacts (same phone)
  fastify.get('/contacts/duplicates', auth, async (req) => {
    const { rows } = await query(`
      SELECT phone, COUNT(*) as count,
        array_agg(id ORDER BY created_at ASC) as ids,
        array_agg(name ORDER BY created_at ASC) as names,
        array_agg(created_at ORDER BY created_at ASC) as created_ats
      FROM contacts
      WHERE phone IS NOT NULL AND phone != ''
      GROUP BY phone
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 100
    `);
    return rows;
  });

  // Merge duplicate contacts: keep_id absorbs all merge_ids
  fastify.post('/contacts/merge', auth, async (req, reply) => {
    const { keep_id, merge_ids } = req.body;
    if (!keep_id || !Array.isArray(merge_ids) || !merge_ids.length) {
      return reply.status(400).send({ error: 'keep_id e merge_ids obrigatórios' });
    }
    const ph = merge_ids.map((_, i) => `$${i + 2}`).join(',');
    // Reassign conversations + messages contact data
    await query(`UPDATE conversations SET contact_id=$1 WHERE contact_id IN (${ph})`, [keep_id, ...merge_ids]);
    await query(`DELETE FROM contacts WHERE id IN (${ph})`, [keep_id, ...merge_ids]);
    invalidate('contacts:list:*').catch(() => {});
    return { ok: true, merged: merge_ids.length };
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

  // ── Contact Segments CRUD ─────────────────────────────────────────────────
  // Migration (run once on DB):
  // CREATE TABLE IF NOT EXISTS contact_segments (
  //   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  //   name TEXT NOT NULL,
  //   description TEXT,
  //   rules JSONB DEFAULT '[]',
  //   created_at TIMESTAMPTZ DEFAULT NOW()
  // );

  fastify.get('/segments', auth, async () => {
    const { rows } = await query('SELECT * FROM contact_segments ORDER BY created_at DESC');
    return rows;
  });

  fastify.post('/segments', auth, async (req, reply) => {
    const { name, description, rules } = req.body;
    if (!name) return reply.status(400).send({ error: 'name é obrigatório' });
    const { rows } = await query(
      'INSERT INTO contact_segments (name, description, rules) VALUES ($1,$2,$3) RETURNING *',
      [name, description || null, JSON.stringify(rules || [])]
    );
    return reply.status(201).send(rows[0]);
  });

  fastify.patch('/segments/:id', auth, async (req, reply) => {
    const { name, description, rules } = req.body;
    const updates = [];
    const params = [];
    let p = 1;
    if (name !== undefined) { updates.push(`name=$${p}`); params.push(name); p++; }
    if (description !== undefined) { updates.push(`description=$${p}`); params.push(description); p++; }
    if (rules !== undefined) { updates.push(`rules=$${p}`); params.push(JSON.stringify(rules)); p++; }
    if (!updates.length) return reply.status(400).send({ error: 'Nada para atualizar' });
    params.push(req.params.id);
    const { rows } = await query(`UPDATE contact_segments SET ${updates.join(',')} WHERE id=$${p} RETURNING *`, params);
    if (!rows[0]) return reply.status(404).send({ error: 'Segmento não encontrado' });
    return rows[0];
  });

  fastify.delete('/segments/:id', auth, async (req, reply) => {
    const { rowCount } = await query('DELETE FROM contact_segments WHERE id=$1', [req.params.id]);
    if (!rowCount) return reply.status(404).send({ error: 'Segmento não encontrado' });
    return { ok: true };
  });

  fastify.get('/segments/:id/contacts', auth, async (req, reply) => {
    const { rows: segs } = await query('SELECT * FROM contact_segments WHERE id=$1', [req.params.id]);
    if (!segs[0]) return reply.status(404).send({ error: 'Segmento não encontrado' });
    const rules = segs[0].rules || [];

    const conditions = [];
    const params = [];
    let pi = 1;

    for (const rule of rules) {
      if (rule.field === 'tag' && rule.operator === 'contains') {
        conditions.push(`$${pi} = ANY(tags)`); params.push(rule.value); pi++;
      } else if (rule.field === 'created_days_ago' && rule.operator === 'less_than') {
        conditions.push(`created_at > NOW() - interval '1 day' * $${pi}`); params.push(Number(rule.value)); pi++;
      } else if (rule.field === 'phone_contains') {
        conditions.push(`phone LIKE $${pi}`); params.push(`%${rule.value}%`); pi++;
      } else if (rule.field === 'label' && rule.operator === 'contains') {
        conditions.push(`$${pi} = ANY(label_ids)`); params.push(rule.value); pi++;
      } else if (rule.field === 'city' && rule.operator === 'contains') {
        conditions.push(`city ILIKE $${pi}`); params.push(`%${rule.value}%`); pi++;
      } else if (rule.field === 'state' && rule.operator === 'equals') {
        conditions.push(`state = $${pi}`); params.push(rule.value); pi++;
      }
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await query(
      `SELECT id, name, phone, email, tags, created_at FROM contacts ${where} LIMIT 500`,
      params
    );
    return rows;
  });

  // Import contacts via CSV (multipart file upload)
  fastify.post('/contacts/import-csv', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'Arquivo não enviado' });
    const csv = (await data.toBuffer()).toString('utf8');
    const lines = csv.split('\n').filter(l => l.trim());
    if (lines.length < 2) return reply.status(400).send({ error: 'CSV vazio' });

    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());
    const results = { imported: 0, errors: [], skipped: 0 };

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim().replace(/"/g, ''));
      const row = {};
      headers.forEach((h, idx) => { row[h] = vals[idx] || ''; });

      const name = row['nome'] || row['name'] || row['contato'] || '';
      const phone = (row['telefone'] || row['phone'] || row['fone'] || '').replace(/\D/g, '');
      const email = row['email'] || row['e-mail'] || '';
      const tags = row['tags'] || row['etiquetas'] || '';

      if (!name && !phone) { results.skipped++; continue; }

      try {
        await query(
          `INSERT INTO contacts (name, phone, email, tags, created_at)
           VALUES ($1,$2,$3,$4,NOW())
           ON CONFLICT (phone) WHERE phone IS NOT NULL DO UPDATE SET name=EXCLUDED.name, email=EXCLUDED.email`,
          [name, phone || null, email || null, tags ? tags.split(';') : null]
        );
        results.imported++;
      } catch(e) {
        results.errors.push({ row: i, error: e.message });
      }
    }
    return results;
  });

  // GET template CSV
  fastify.get('/contacts/import-csv/template', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const csv = 'nome,telefone,email,empresa,tags\nJoão Silva,5511999990000,joao@email.com,Empresa X,cliente;vip\n';
    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', 'attachment; filename="template_contatos.csv"');
    return csv;
  });

  // ── Contact Documents ────────────────────────────────────────────────────
  fastify.get('/contacts/:id/documents', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query(
      'SELECT d.*, p.name as uploaded_by_name FROM contact_documents d LEFT JOIN profiles p ON p.id=d.uploaded_by WHERE d.contact_id=$1 ORDER BY d.created_at DESC',
      [req.params.id]
    );
    return rows;
  });

  fastify.post('/contacts/:id/documents', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const data = await req.file();
    if (!data) return reply.status(400).send({ error: 'Arquivo não enviado' });

    const buffer = await data.toBuffer();
    const filename = data.filename || 'documento';
    const mimetype = data.mimetype || 'application/octet-stream';
    const size = buffer.length;

    const { minioClient, BUCKET } = await import('../minio.js');
    const objectName = `contacts/${req.params.id}/${Date.now()}-${filename}`;
    await minioClient.putObject(BUCKET, objectName, buffer, size, { 'Content-Type': mimetype });

    const { rows } = await query(
      'INSERT INTO contact_documents (contact_id, filename, object_name, mimetype, size, uploaded_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.params.id, filename, objectName, mimetype, size, req.user.id]
    );
    return rows[0];
  });

  fastify.get('/contacts/:id/documents/:docId/download', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query('SELECT * FROM contact_documents WHERE id=$1 AND contact_id=$2', [req.params.docId, req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Documento não encontrado' });

    const { minioClient, BUCKET } = await import('../minio.js');
    const url = await minioClient.presignedGetObject(BUCKET, rows[0].object_name, 3600);
    return reply.redirect(url);
  });

  fastify.delete('/contacts/:id/documents/:docId', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query('SELECT * FROM contact_documents WHERE id=$1 AND contact_id=$2', [req.params.docId, req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Documento não encontrado' });

    const { minioClient, BUCKET } = await import('../minio.js');
    await minioClient.removeObject(BUCKET, rows[0].object_name).catch(() => {});
    await query('DELETE FROM contact_documents WHERE id=$1', [req.params.docId]);
    return { success: true };
  });

  // Import contacts via vCard (.vcf)
  fastify.post('/contacts/import-vcf', auth, async (req, reply) => {
    const { vcf } = req.body;
    if (!vcf || typeof vcf !== 'string') return reply.status(400).send({ error: 'vcf text obrigatório' });

    // Split into individual vCard blocks
    const blocks = vcf.split(/BEGIN:VCARD/i).filter(b => b.includes('END:VCARD'));

    let imported = 0;
    let skipped = 0;
    let errors = 0;

    for (const block of blocks) {
      try {
        // Extract FN (full name)
        const fnMatch = block.match(/^FN[^:]*:(.+)$/mi);
        const name = fnMatch ? fnMatch[1].trim().replace(/\\n/g, ' ').replace(/\r/g, '') : null;

        // Extract first TEL
        const telMatch = block.match(/^TEL[^:]*:(.+)$/mi);
        let phone = telMatch ? telMatch[1].trim().replace(/\r/g, '') : null;
        if (phone) {
          // Keep digits and leading +
          const cleaned = phone.replace(/[^\d+]/g, '');
          phone = cleaned || null;
        }

        // Extract EMAIL (optional)
        const emailMatch = block.match(/^EMAIL[^:]*:(.+)$/mi);
        const email = emailMatch ? emailMatch[1].trim().replace(/\r/g, '') : null;

        if (!phone) { skipped++; continue; }
        if (!name) { skipped++; continue; }

        await query(
          `INSERT INTO contacts (name, phone, email) VALUES ($1, $2, $3)
           ON CONFLICT (phone) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
          [name, phone, email || null]
        );
        imported++;
      } catch (e) {
        errors++;
      }
    }

    return { imported, skipped, errors };
  });
}
