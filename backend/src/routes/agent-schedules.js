import { query } from '../database.js';

export default async function agentScheduleRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  fastify.get('/agent-schedules', auth, async () => {
    const { rows } = await query('SELECT a.*, p.name as agent_name FROM agent_schedules a LEFT JOIN profiles p ON p.id = a.agent_id ORDER BY p.name LIMIT 200');
    return rows;
  });
  fastify.post('/agent-schedules', auth, async (req, reply) => {
    const f = req.body;
    const { rows } = await query(`
      INSERT INTO agent_schedules (agent_id, monday_start, monday_end, monday_active, tuesday_start, tuesday_end, tuesday_active, wednesday_start, wednesday_end, wednesday_active, thursday_start, thursday_end, thursday_active, friday_start, friday_end, friday_active, saturday_start, saturday_end, saturday_active, sunday_start, sunday_end, sunday_active, timezone, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
      ON CONFLICT (agent_id) DO UPDATE SET
        monday_start=$2, monday_end=$3, monday_active=$4,
        tuesday_start=$5, tuesday_end=$6, tuesday_active=$7,
        wednesday_start=$8, wednesday_end=$9, wednesday_active=$10,
        thursday_start=$11, thursday_end=$12, thursday_active=$13,
        friday_start=$14, friday_end=$15, friday_active=$16,
        saturday_start=$17, saturday_end=$18, saturday_active=$19,
        sunday_start=$20, sunday_end=$21, sunday_active=$22,
        timezone=$23, is_active=$24
      RETURNING *`,
      [f.agent_id || req.user.id, f.monday_start, f.monday_end, f.monday_active ?? true, f.tuesday_start, f.tuesday_end, f.tuesday_active ?? true, f.wednesday_start, f.wednesday_end, f.wednesday_active ?? true, f.thursday_start, f.thursday_end, f.thursday_active ?? true, f.friday_start, f.friday_end, f.friday_active ?? true, f.saturday_start, f.saturday_end, f.saturday_active ?? false, f.sunday_start, f.sunday_end, f.sunday_active ?? false, f.timezone || 'America/Sao_Paulo', f.is_active ?? true]
    );
    return reply.status(201).send(rows[0]);
  });
  fastify.patch('/agent-schedules/:id', auth, async (req) => {
    const f = req.body;
    const { rows } = await query('UPDATE agent_schedules SET is_active=COALESCE($1,is_active) WHERE id=$2 RETURNING *', [f.is_active, req.params.id]);
    return rows[0];
  });
}
