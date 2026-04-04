import { query } from '../database.js';

export default async function productRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/products', auth, async () => {
    const { rows } = await query('SELECT * FROM products ORDER BY name');
    return rows;
  });
  fastify.post('/products', auth, async (req, reply) => {
    const { name, description, price, image_url, is_active } = req.body;
    const { rows } = await query('INSERT INTO products (name, description, price, image_url, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *', [name, description, price || 0, image_url, is_active ?? true]);
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/products/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE products SET name=COALESCE($1,name), description=COALESCE($2,description), price=COALESCE($3,price), is_active=COALESCE($4,is_active) WHERE id=$5 RETURNING *', [f.name, f.description, f.price, f.is_active, req.params.id]);
    return rows[0];
  });
  fastify.delete('/products/:id', auth, async (req) => {
    await query('DELETE FROM products WHERE id=$1', [req.params.id]); return { ok: true };
  });
}
