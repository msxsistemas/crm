// CREATE TABLE IF NOT EXISTS scheduled_reports (
//   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
//   name TEXT NOT NULL,
//   emails TEXT[] NOT NULL,
//   frequency TEXT DEFAULT 'weekly',
//   report_type TEXT DEFAULT 'conversations',
//   is_active BOOLEAN DEFAULT true,
//   created_by UUID REFERENCES profiles(id),
//   next_run_at TIMESTAMPTZ,
//   last_run_at TIMESTAMPTZ,
//   created_at TIMESTAMPTZ DEFAULT NOW()
// );

import { query } from '../database.js';
import { redis } from '../redis.js';

const formatMinSec = (minutes) => {
  const m = Math.floor(minutes);
  const s = Math.round((minutes - m) * 60);
  if (m === 0) return `${s}s`;
  return s > 0 ? `${m}min ${s}s` : `${m}min`;
};

export default async function statsRoutes(fastify) {
  const auth = { preHandler: fastify.authenticate };

  // TopBar stats (30s Redis cache per user)
  fastify.get('/stats/topbar', auth, async (req) => {
    const userId = req.user.id;
    const cacheKey = `stats:topbar:${userId}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    const { rows } = await query(`
      SELECT
        p.full_name, p.status,
        (SELECT COUNT(*)::int FROM evolution_connections WHERE user_id = $1 AND status = 'open') AS connection_count,
        (SELECT COUNT(*)::int FROM conversations WHERE unread_count > 0) AS unread_conversations,
        (SELECT COUNT(*)::int FROM conversations WHERE status = 'open') AS waiting_conversations
      FROM profiles p WHERE p.id = $1
    `, [userId]);

    const row = rows[0] || {};
    const result = {
      fullName: row.full_name || null,
      status: row.status || 'online',
      connectionCount: row.connection_count ?? 0,
      unreadConversations: row.unread_conversations ?? 0,
      waitingConversations: row.waiting_conversations ?? 0,
    };
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 30).catch(() => null);
    return result;
  });

  // Full dashboard stats — replaces 6 parallel frontend queries + all client-side useMemo computations
  fastify.get('/stats/dashboard-full', auth, async (req) => {
    const {
      start, end,
      groupBy = 'day',
      connection = 'all',
      agent = 'all',
      prevStart, prevEnd,
    } = req.query;

    if (!start || !end) return fastify.httpErrors?.badRequest('start and end required') || { error: 'start and end required' };

    const cacheKey = `stats:dash-full:${req.user.id}:${start}:${end}:${groupBy}:${connection}:${agent}`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    // Build optional filter conditions
    const filterParams = [start, end];
    const connCond = connection !== 'all' ? `AND connection_name = $${filterParams.push(connection)}` : '';
    const agentCond = agent !== 'all' ? `AND assigned_to = $${filterParams.push(agent)}` : '';

    const truncUnit = groupBy === 'month' ? 'month' : groupBy === 'week' ? 'week' : 'day';
    const periodFormat = groupBy === 'month' ? "'Mon/YY'" : groupBy === 'week' ? "'DD/MM'" : "'DD/MM/YY'";

    const [
      realtimeRes,
      kpisRes,
      avgRespRes,
      timelineRes,
      agentRes,
      hourlyRes,
      heatmapRes,
      connStatsRes,
      profilesRes,
      msgCountRes,
      totalContactsRes,
    ] = await Promise.all([
      // 1. Realtime counts (no date filter — always current)
      query(`
        SELECT
          COUNT(*) FILTER (WHERE status = 'open') AS open_count,
          COUNT(*) FILTER (WHERE status = 'open' AND unread_count > 0) AS pending_count,
          COUNT(*) FILTER (WHERE status IN ('closed','resolved') AND updated_at >= $1 AND updated_at <= $2) AS closed_count
        FROM conversations
      `, [start, end]),

      // 2. KPIs in date range
      query(`
        SELECT
          COUNT(*) AS total_tickets,
          COUNT(*) FILTER (WHERE status IN ('closed','resolved')) AS resolved_tickets,
          COALESCE(ROUND((AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)
            FILTER (WHERE status IN ('closed','resolved')))::numeric, 2), 0) AS avg_resolution_hours,
          COUNT(*) FILTER (
            WHERE status IN ('closed','resolved')
            AND EXTRACT(EPOCH FROM (updated_at - created_at)) < 86400
          ) AS within_sla_count
        FROM conversations
        WHERE created_at >= $1 AND created_at <= $2 ${connCond} ${agentCond}
      `, filterParams),

      // 3. Avg response time (first reply minus first received, per conversation)
      query(`
        SELECT COALESCE(AVG(resp_mins)::float, 0) AS avg_response_minutes
        FROM (
          SELECT EXTRACT(EPOCH FROM (fr.t - fi.t))/60 AS resp_mins
          FROM conversations c
          JOIN LATERAL (
            SELECT MIN(m.created_at) AS t FROM messages m
            WHERE m.conversation_id = c.id AND m.direction = 'inbound'
          ) fi ON fi.t IS NOT NULL
          JOIN LATERAL (
            SELECT MIN(m.created_at) AS t FROM messages m
            WHERE m.conversation_id = c.id AND m.direction = 'outbound' AND m.created_at > fi.t
          ) fr ON fr.t IS NOT NULL
          WHERE c.created_at >= $1 AND c.created_at <= $2 ${connCond} ${agentCond}
        ) sub WHERE resp_mins > 0 AND resp_mins < 1440
      `, filterParams),

      // 4. Timeline grouped by day/week/month
      query(`
        SELECT
          to_char(DATE_TRUNC('${truncUnit}', created_at), ${periodFormat}) AS period,
          DATE_TRUNC('${truncUnit}', created_at) AS sort_key,
          COUNT(*) AS created,
          COUNT(*) FILTER (WHERE status IN ('closed','resolved')) AS resolved,
          COUNT(*) FILTER (WHERE status = 'open' AND unread_count > 0) AS pending
        FROM conversations
        WHERE created_at >= $1 AND created_at <= $2 ${connCond} ${agentCond}
        GROUP BY period, sort_key ORDER BY sort_key
      `, filterParams),

      // 5. Agent performance with response time (show all agents regardless of filter)
      query(`
        WITH agent_resp AS (
          SELECT c.assigned_to,
            COALESCE(
              AVG(EXTRACT(EPOCH FROM (fr.t - fi.t))/60)
              FILTER (WHERE EXTRACT(EPOCH FROM (fr.t - fi.t))/60 BETWEEN 0 AND 1440),
              0
            ) AS avg_resp_mins
          FROM conversations c
          JOIN LATERAL (
            SELECT MIN(m.created_at) AS t FROM messages m
            WHERE m.conversation_id = c.id AND m.direction = 'inbound'
          ) fi ON fi.t IS NOT NULL
          JOIN LATERAL (
            SELECT MIN(m.created_at) AS t FROM messages m
            WHERE m.conversation_id = c.id AND m.direction = 'outbound' AND m.created_at > fi.t
          ) fr ON fr.t IS NOT NULL
          WHERE c.created_at >= $1 AND c.created_at <= $2
          GROUP BY c.assigned_to
        )
        SELECT
          p.id,
          COALESCE(p.full_name, p.email, 'Agente') AS name,
          COALESCE(p.email, '') AS email,
          COALESCE(p.status, 'offline') AS status,
          COUNT(c.id) AS total,
          COUNT(c.id) FILTER (WHERE c.status IN ('closed','resolved')) AS resolved,
          COALESCE(ar.avg_resp_mins, 0)::float AS avg_response_minutes
        FROM profiles p
        LEFT JOIN conversations c ON c.assigned_to = p.id
          AND c.created_at >= $1 AND c.created_at <= $2
        LEFT JOIN agent_resp ar ON ar.assigned_to = p.id
        WHERE p.role IN ('agent','supervisor','admin','manager','owner')
        GROUP BY p.id, p.full_name, p.email, p.status, ar.avg_resp_mins
        ORDER BY COUNT(c.id) DESC
        LIMIT 10
      `, [start, end]),

      // 6. Hourly message distribution
      query(`
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, COUNT(*)::int AS count
        FROM messages WHERE created_at >= $1 AND created_at <= $2
        GROUP BY 1 ORDER BY 1
      `, [start, end]),

      // 7. Heatmap: messages by day-of-week (Mon=0) × hour
      query(`
        SELECT
          ((EXTRACT(DOW FROM created_at)::int + 6) % 7) AS day_of_week,
          EXTRACT(HOUR FROM created_at)::int AS hour,
          COUNT(*)::int AS count
        FROM messages WHERE created_at >= $1 AND created_at <= $2
        GROUP BY 1, 2 ORDER BY 1, 2
      `, [start, end]),

      // 8. Per-connection stats
      query(`
        WITH msg_stats AS (
          SELECT c.connection_name,
            COUNT(*) FILTER (WHERE m.direction = 'outbound') AS sent,
            COUNT(*) FILTER (WHERE m.direction = 'inbound') AS received
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE m.created_at >= $1 AND m.created_at <= $2
          GROUP BY c.connection_name
        ),
        conv_stats AS (
          SELECT connection_name,
            COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2) AS created,
            COUNT(*) FILTER (WHERE status = 'closed' AND updated_at >= $1 AND updated_at <= $2) AS resolved
          FROM conversations GROUP BY connection_name
        )
        SELECT
          ec.id, ec.instance_name, ec.status,
          COALESCE(ms.sent, 0) AS sent,
          COALESCE(ms.received, 0) AS received,
          COALESCE(cs.created, 0) AS created,
          COALESCE(cs.resolved, 0) AS resolved
        FROM evolution_connections ec
        LEFT JOIN msg_stats ms ON ms.connection_name = ec.instance_name
        LEFT JOIN conv_stats cs ON cs.connection_name = ec.instance_name
      `, [start, end]),

      // 9. Profiles list for selectors
      query(`SELECT id, full_name, email, status FROM profiles ORDER BY full_name NULLS LAST`),

      // 10. Total sent/received messages in period
      query(`
        SELECT
          COUNT(*) FILTER (WHERE direction = 'outbound') AS sent,
          COUNT(*) FILTER (WHERE direction = 'inbound') AS received
        FROM messages WHERE created_at >= $1 AND created_at <= $2
      `, [start, end]),

      // 11. Total contacts
      query(`SELECT COUNT(*)::int AS total FROM contacts`),
    ]);

    // Build heatmap 7×24 grid
    const heatmapGrid = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const row of heatmapRes.rows) {
      heatmapGrid[row.day_of_week][row.hour] = row.count;
    }

    // Build hourly data (fill missing hours with 0)
    const hourlyMap = {};
    for (const row of hourlyRes.rows) hourlyMap[row.hour] = row.count;
    const hourlyData = Array.from({ length: 24 }, (_, h) => ({ name: `${h}h`, value: hourlyMap[h] || 0 }));

    // Format agent data
    const agentData = agentRes.rows.map(r => {
      const total = r.total || 0;
      const resolved = r.resolved || 0;
      const rate = total > 0 ? ((resolved / total) * 100).toFixed(1) : '0.0';
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        status: r.status,
        total,
        resolved,
        rate,
        avgTime: formatMinSec(r.avg_response_minutes || 0),
        initials: (r.name || 'A').substring(0, 2).toUpperCase(),
        online: r.status === 'online',
      };
    });

    const rt = realtimeRes.rows[0] || {};
    const kp = kpisRes.rows[0] || {};
    const msgC = msgCountRes.rows[0] || {};
    const resolvedTickets = kp.resolved_tickets || 0;
    const totalTickets = kp.total_tickets || 0;

    const result = {
      realtime: {
        openCount: rt.open_count || 0,
        pendingCount: rt.pending_count || 0,
        closedCount: rt.closed_count || 0,
      },
      kpis: {
        totalTickets,
        resolvedTickets,
        resolutionRate: totalTickets > 0 ? ((resolvedTickets / totalTickets) * 100).toFixed(1) : '0.0',
        avgResponseMinutes: parseFloat((avgRespRes.rows[0]?.avg_response_minutes || 0).toFixed(1)),
        avgResolutionHours: parseFloat((kp.avg_resolution_hours || 0).toString()),
        slaCompliance: resolvedTickets > 0
          ? Math.round(((kp.within_sla_count || 0) / resolvedTickets) * 100)
          : 0,
        sentMessages: msgC.sent || 0,
        receivedMessages: msgC.received || 0,
        totalContacts: totalContactsRes.rows[0]?.total || 0,
      },
      timeline: timelineRes.rows.map(r => ({
        name: r.period,
        Criados: r.created,
        Resolvidos: r.resolved,
        Pendentes: r.pending,
      })),
      agentData,
      hourlyData,
      heatmapGrid,
      connectionStats: connStatsRes.rows.map(r => ({
        id: r.id,
        instance_name: r.instance_name,
        label: r.instance_name,
        status: r.status,
        type: 'whatsapp',
        sent: r.sent,
        received: r.received,
        created: r.created,
        resolved: r.resolved,
      })),
      profiles: profilesRes.rows,
    };

    // Previous period KPIs (only if requested)
    if (prevStart && prevEnd) {
      const [prevKpisRes, prevAvgRes] = await Promise.all([
        query(`
          SELECT
            COUNT(*) AS total_tickets,
            COUNT(*) FILTER (WHERE status IN ('closed','resolved')) AS resolved_tickets,
            COUNT(*) FILTER (
              WHERE status IN ('closed','resolved')
              AND EXTRACT(EPOCH FROM (updated_at - created_at)) < 86400
            ) AS within_sla_count
          FROM conversations WHERE created_at >= $1 AND created_at <= $2
        `, [prevStart, prevEnd]),
        query(`
          SELECT COALESCE(AVG(resp_mins)::float, 0) AS avg_response_minutes
          FROM (
            SELECT EXTRACT(EPOCH FROM (fr.t - fi.t))/60 AS resp_mins
            FROM conversations c
            JOIN LATERAL (SELECT MIN(m.created_at) AS t FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'inbound') fi ON fi.t IS NOT NULL
            JOIN LATERAL (SELECT MIN(m.created_at) AS t FROM messages m WHERE m.conversation_id = c.id AND m.direction = 'outbound' AND m.created_at > fi.t) fr ON fr.t IS NOT NULL
            WHERE c.created_at >= $1 AND c.created_at <= $2
          ) sub WHERE resp_mins > 0 AND resp_mins < 1440
        `, [prevStart, prevEnd]),
      ]);
      const pk = prevKpisRes.rows[0] || {};
      const prevRes = pk.resolved_tickets || 0;
      const prevTotal = pk.total_tickets || 0;
      result.prevKpis = {
        totalTickets: prevTotal,
        resolutionRate: prevTotal > 0 ? (prevRes / prevTotal) * 100 : 0,
        avgResponseMinutes: parseFloat((prevAvgRes.rows[0]?.avg_response_minutes || 0).toFixed(1)),
        slaCompliance: prevRes > 0 ? Math.round(((pk.within_sla_count || 0) / prevRes) * 100) : 0,
      };
    }

    // Cache 2 minutes
    await redis.set(cacheKey, JSON.stringify(result), 'EX', 120).catch(() => null);
    return result;
  });

  // ── Stats by Channel ─────────────────────────────────────────────────────
  fastify.get('/stats/by-channel', auth, async (req, reply) => {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const endDate = end || new Date().toISOString();

    const { rows } = await query(`
      SELECT
        COALESCE(c.connection_name, 'web') as channel,
        COUNT(c.id) as total_conversations,
        COUNT(c.id) FILTER (WHERE c.status='closed') as closed,
        COUNT(c.id) FILTER (WHERE c.status='open') as open,
        ROUND(AVG(c.csat_score)::numeric, 2) as avg_csat,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(c.first_response_at, NOW()) - c.created_at))/60)::numeric, 1) as avg_response_min,
        COUNT(DISTINCT c.contact_id) as unique_contacts,
        COUNT(m.id) as total_messages
      FROM conversations c
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE c.created_at BETWEEN $1 AND $2
      GROUP BY COALESCE(c.connection_name, 'web')
      ORDER BY total_conversations DESC
    `, [startDate, endDate]);
    return rows;
  });

  // ── Scheduled Reports Config ──────────────────────────────────────────────
  fastify.get('/scheduled-reports', auth, async (req) => {
    const { rows } = await query('SELECT * FROM scheduled_reports WHERE created_by=$1 ORDER BY created_at DESC', [req.user.id]);
    return rows;
  });

  fastify.post('/scheduled-reports', auth, async (req, reply) => {
    const { name, emails, frequency, report_type } = req.body;
    // frequency: 'daily' | 'weekly'
    // report_type: 'conversations' | 'agents' | 'csat'
    const { rows } = await query(
      "INSERT INTO scheduled_reports (name, emails, frequency, report_type, created_by, next_run_at) VALUES ($1,$2,$3,$4,$5, CASE WHEN $3='daily' THEN NOW() + interval '1 day' ELSE NOW() + interval '7 days' END) RETURNING *",
      [name, emails, frequency, report_type || 'conversations', req.user.id]
    );
    return reply.code(201).send(rows[0]);
  });

  fastify.delete('/scheduled-reports/:id', auth, async (req) => {
    await query('DELETE FROM scheduled_reports WHERE id=$1 AND created_by=$2', [req.params.id, req.user.id]);
    return { ok: true };
  });

  // CSAT stats
  fastify.get('/stats/csat', auth, async (req) => {
    const { start, end } = req.query;
    const { rows } = await query(`
      SELECT
        ROUND(AVG(csat_score)::numeric, 2) as avg_score,
        COUNT(*) FILTER (WHERE csat_score IS NOT NULL) as total_responses,
        COUNT(*) FILTER (WHERE csat_sent_at IS NOT NULL) as total_sent,
        COUNT(*) FILTER (WHERE csat_score = 5) as score_5,
        COUNT(*) FILTER (WHERE csat_score = 4) as score_4,
        COUNT(*) FILTER (WHERE csat_score = 3) as score_3,
        COUNT(*) FILTER (WHERE csat_score <= 2) as score_low
      FROM conversations
      WHERE csat_sent_at >= $1 AND csat_sent_at <= $2
    `, [start || '2020-01-01', end || 'NOW()']);
    return rows[0];
  });

  // NPS stats
  fastify.get('/stats/nps', auth, async (req) => {
    const { start, end } = req.query;
    const { rows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE nps_score >= 9) as promoters,
        COUNT(*) FILTER (WHERE nps_score >= 7 AND nps_score <= 8) as passives,
        COUNT(*) FILTER (WHERE nps_score <= 6 AND nps_score IS NOT NULL) as detractors,
        COUNT(*) FILTER (WHERE nps_score IS NOT NULL) as total_responses,
        COUNT(*) FILTER (WHERE nps_sent_at IS NOT NULL) as total_sent,
        ROUND(AVG(nps_score)::numeric, 1) as avg_score,
        ROUND(
          (COUNT(*) FILTER (WHERE nps_score >= 9)::numeric - COUNT(*) FILTER (WHERE nps_score <= 6 AND nps_score IS NOT NULL)::numeric)
          / NULLIF(COUNT(*) FILTER (WHERE nps_score IS NOT NULL), 0)::numeric * 100, 1
        ) as nps_score
      FROM conversations
      WHERE ($1::date IS NULL OR created_at >= $1) AND ($2::date IS NULL OR created_at <= $2)
    `, [start || null, end || null]);
    return rows[0];
  });

  // Agent stats for today
  fastify.get('/stats/agents-today', auth, async (req) => {
    const { rows } = await query(`
      SELECT
        p.id, p.full_name AS name, p.avatar_url, p.status,
        COUNT(DISTINCT c.id) FILTER (WHERE c.created_at >= CURRENT_DATE) AS conversations_today,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status != 'closed') AS open_now,
        COUNT(DISTINCT c.id) FILTER (WHERE c.status = 'closed' AND c.updated_at >= CURRENT_DATE) AS closed_today
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id
      WHERE p.role IN ('agent', 'supervisor', 'admin')
      GROUP BY p.id ORDER BY conversations_today DESC
    `);
    return rows;
  });

  // Birthdays endpoint — replaces loading 2000 contacts on the client
  fastify.get('/stats/birthdays', auth, async (req) => {
    const cacheKey = `stats:birthdays`;
    const cached = await redis.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached);

    // Get contacts whose birthday (MM-DD) falls within the next 7 days
    const { rows } = await query(`
      SELECT id, name, phone, birthday::text AS birthday
      FROM contacts
      WHERE birthday IS NOT NULL
        AND (
          CASE
            WHEN to_char(CURRENT_DATE, 'MM-DD') <= to_char(CURRENT_DATE + INTERVAL '7 days', 'MM-DD')
            THEN to_char(birthday::date, 'MM-DD') BETWEEN to_char(CURRENT_DATE, 'MM-DD') AND to_char(CURRENT_DATE + INTERVAL '7 days', 'MM-DD')
            ELSE to_char(birthday::date, 'MM-DD') >= to_char(CURRENT_DATE, 'MM-DD')
              OR to_char(birthday::date, 'MM-DD') <= to_char(CURRENT_DATE + INTERVAL '7 days', 'MM-DD')
          END
        )
      ORDER BY to_char(birthday::date, 'MM-DD')
      LIMIT 50
    `);

    // Compute days until birthday in JS (small dataset)
    const today = new Date();
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const result = rows.map(c => {
      const bday = new Date(c.birthday);
      let next = new Date(today.getFullYear(), bday.getMonth(), bday.getDate());
      if (next.getTime() < todayMs) next = new Date(today.getFullYear() + 1, bday.getMonth(), bday.getDate());
      return {
        id: c.id,
        name: c.name,
        phone: c.phone,
        birthday: c.birthday,
        daysUntil: Math.round((next.getTime() - todayMs) / 86400000),
      };
    }).filter(c => c.daysUntil >= 0 && c.daysUntil <= 7)
      .sort((a, b) => a.daysUntil - b.daysUntil);

    await redis.set(cacheKey, JSON.stringify(result), 'EX', 3600).catch(() => null);
    return result;
  });

  // ── Agent Report PDF (data only — frontend generates PDF) ─────────────────
  fastify.get('/stats/agent-report-pdf', auth, async (req, reply) => {
    const { agent_id, start, end } = req.query;
    if (!agent_id) return reply.code(400).send({ error: 'agent_id é obrigatório' });
    const { rows } = await query(`
      SELECT
        p.full_name,
        COUNT(c.id) FILTER (WHERE c.status='closed') as closed_count,
        ROUND(AVG(c.csat_score)::numeric, 2) as avg_csat,
        COUNT(m.id) as messages_sent,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at))/60)::numeric, 1) as avg_response_min
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id AND c.created_at BETWEEN $2 AND $3
      LEFT JOIN messages m ON m.conversation_id = c.id AND m.sender_type='agent'
      WHERE p.id = $1
      GROUP BY p.full_name
    `, [agent_id, start || 'NOW() - interval \'30 days\'', end || 'NOW()']);
    return rows[0] || {};
  });

  // ── Campaigns Dashboard ───────────────────────────────────────────────────
  fastify.get('/stats/campaigns', auth, async (req) => {
    const { rows } = await query(`
      SELECT
        c.id, c.name, c.status, c.created_at,
        COUNT(cr.id) as total_sent,
        COUNT(cr.id) FILTER (WHERE cr.status='delivered') as delivered,
        COUNT(cr.id) FILTER (WHERE cr.status='read') as read_count,
        COUNT(DISTINCT cv.id) FILTER (WHERE cv.last_message_at > c.dispatched_at) as replied
      FROM campaigns c
      LEFT JOIN campaign_recipients cr ON cr.campaign_id = c.id
      LEFT JOIN conversations cv ON cv.contact_id = cr.contact_id AND cv.created_at >= c.created_at
      WHERE c.status = 'sent' OR c.dispatched_at IS NOT NULL
      GROUP BY c.id ORDER BY c.created_at DESC LIMIT 20
    `);
    return rows;
  });

  // ── Tags Analytics ────────────────────────────────────────────────────────
  fastify.get('/stats/tags', auth, async (req) => {
    const { start, end } = req.query;

    // Tag usage across contacts
    const { rows: contactTags } = await query(`
      SELECT tag, COUNT(*) as contact_count
      FROM contacts, unnest(tags) as tag
      WHERE ($1::date IS NULL OR created_at >= $1) AND ($2::date IS NULL OR created_at <= $2)
      GROUP BY tag ORDER BY contact_count DESC LIMIT 30
    `, [start || null, end || null]);

    // Tag usage across conversations
    const { rows: convTags } = await query(`
      SELECT tag, COUNT(*) as conv_count
      FROM conversations, unnest(label_ids) as tag
      WHERE ($1::date IS NULL OR created_at >= $1) AND ($2::date IS NULL OR created_at <= $2)
      GROUP BY tag ORDER BY conv_count DESC LIMIT 30
    `, [start || null, end || null]);

    // Weekly trend of most used tags (last 8 weeks)
    const { rows: trend } = await query(`
      SELECT
        DATE_TRUNC('week', created_at) as week,
        tag,
        COUNT(*) as count
      FROM contacts, unnest(tags) as tag
      WHERE created_at > NOW() - interval '8 weeks'
      GROUP BY week, tag
      ORDER BY week DESC, count DESC
    `);

    return { contactTags, convTags, trend };
  });

  // ── Sentiment Analysis Dashboard ─────────────────────────────────────────
  fastify.get('/stats/sentiment', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { start, end, agent_id } = req.query;
    const startDate = start || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const endDate = end || new Date().toISOString();

    let agentFilter = '';
    const params = [startDate, endDate];
    if (agent_id) { params.push(agent_id); agentFilter = `AND c.assigned_to=$${params.length}`; }

    const { rows: overall } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE c.sentiment='positivo') as positive,
        COUNT(*) FILTER (WHERE c.sentiment='negativo') as negative,
        COUNT(*) FILTER (WHERE c.sentiment='neutro') as neutral,
        COUNT(*) FILTER (WHERE c.sentiment IS NOT NULL) as total_analyzed
      FROM conversations c
      WHERE c.created_at BETWEEN $1 AND $2 ${agentFilter}
    `, params);

    const { rows: byAgent } = await query(`
      SELECT
        p.full_name as agent_name,
        COUNT(*) FILTER (WHERE c.sentiment='positivo') as positive,
        COUNT(*) FILTER (WHERE c.sentiment='negativo') as negative,
        COUNT(*) FILTER (WHERE c.sentiment='neutro') as neutral,
        COUNT(*) as total
      FROM conversations c
      JOIN profiles p ON p.id=c.assigned_to
      WHERE c.created_at BETWEEN $1 AND $2 AND c.sentiment IS NOT NULL
      GROUP BY p.id, p.full_name ORDER BY negative DESC
    `, [startDate, endDate]);

    const { rows: trend } = await query(`
      SELECT
        DATE(c.created_at) as date,
        COUNT(*) FILTER (WHERE c.sentiment='positivo') as positive,
        COUNT(*) FILTER (WHERE c.sentiment='negativo') as negative,
        COUNT(*) FILTER (WHERE c.sentiment='neutro') as neutral
      FROM conversations c
      WHERE c.created_at BETWEEN $1 AND $2 AND c.sentiment IS NOT NULL
      GROUP BY DATE(c.created_at) ORDER BY date ASC
    `, [startDate, endDate]);

    // Recent negative conversations (for alerts)
    const { rows: alerts } = await query(`
      SELECT c.id, ct.name as contact_name, c.created_at, p.full_name as agent_name
      FROM conversations c
      JOIN contacts ct ON ct.id=c.contact_id
      LEFT JOIN profiles p ON p.id=c.assigned_to
      WHERE c.sentiment='negativo' AND c.status='open' AND c.created_at BETWEEN $1 AND $2
      ORDER BY c.created_at DESC LIMIT 10
    `, [startDate, endDate]);

    return { overall: overall[0], byAgent, trend, alerts };
  });

  // ── Admin Panel Stats ─────────────────────────────────────────────────────
  fastify.get('/stats/admin-panel', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    if (!['admin'].includes(req.user.role)) return reply.status(403).send({ error: 'Forbidden' });

    const [users, conversations, messages, connections, migrations] = await Promise.all([
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='online') as online,
          COUNT(*) FILTER (WHERE role='agent') as agents,
          COUNT(*) FILTER (WHERE role='admin') as admins,
          COUNT(*) FILTER (WHERE created_at > NOW() - interval '7 days') as new_this_week
        FROM profiles WHERE role != 'deleted'
      `),
      query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='open') as open,
          COUNT(*) FILTER (WHERE status='closed') as closed,
          COUNT(*) FILTER (WHERE created_at > NOW() - interval '24 hours') as today,
          COUNT(*) FILTER (WHERE created_at > NOW() - interval '7 days') as this_week
        FROM conversations
      `),
      query(`
        SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE created_at > NOW() - interval '24 hours') as today
        FROM messages
      `),
      query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='open') as connected FROM connections`),
      query(`SELECT COUNT(*) as count FROM _migrations`).catch(() => ({ rows: [{ count: 0 }] })),
    ]);

    return {
      users: users.rows[0],
      conversations: conversations.rows[0],
      messages: messages.rows[0],
      connections: connections.rows[0],
      migrations: migrations.rows[0],
      uptime: process.uptime(),
      node_version: process.version,
      timestamp: new Date().toISOString(),
    };
  });

  // ── Response Time Report ──────────────────────────────────────────────────
  fastify.get('/stats/response-time', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const endDate = end || new Date().toISOString();

    // By agent
    const { rows: byAgent } = await query(`
      SELECT
        p.full_name as name,
        COUNT(c.id) as total,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at))/60)::numeric, 1) as avg_handling_min,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at))/60)::numeric, 1) as avg_first_response_min,
        ROUND(MIN(EXTRACT(EPOCH FROM (c.closed_at - c.created_at))/60)::numeric, 1) as min_handling_min,
        ROUND(MAX(EXTRACT(EPOCH FROM (c.closed_at - c.created_at))/60)::numeric, 1) as max_handling_min
      FROM conversations c
      JOIN profiles p ON p.id = c.assigned_to
      WHERE c.status='closed' AND c.closed_at IS NOT NULL AND c.created_at BETWEEN $1 AND $2
      GROUP BY p.id, p.full_name ORDER BY avg_handling_min ASC
    `, [startDate, endDate]);

    // By team
    const { rows: byTeam } = await query(`
      SELECT
        COALESCE(t.name, 'Sem time') as name,
        COUNT(c.id) as total,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at))/60)::numeric, 1) as avg_handling_min,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at))/60)::numeric, 1) as avg_first_response_min
      FROM conversations c
      LEFT JOIN teams t ON t.id = c.assigned_team_id
      WHERE c.status='closed' AND c.closed_at IS NOT NULL AND c.created_at BETWEEN $1 AND $2
      GROUP BY t.id, t.name ORDER BY avg_handling_min ASC
    `, [startDate, endDate]);

    // By channel
    const { rows: byChannel } = await query(`
      SELECT
        COALESCE(c.connection_name, 'web') as name,
        COUNT(c.id) as total,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at))/60)::numeric, 1) as avg_handling_min
      FROM conversations c
      WHERE c.status='closed' AND c.closed_at IS NOT NULL AND c.created_at BETWEEN $1 AND $2
      GROUP BY c.connection_name ORDER BY avg_handling_min ASC
    `, [startDate, endDate]);

    // Weekly trend
    const { rows: trend } = await query(`
      SELECT
        DATE_TRUNC('week', c.closed_at) as week,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at))/60)::numeric, 1) as avg_handling_min,
        COUNT(*) as count
      FROM conversations c
      WHERE c.status='closed' AND c.closed_at IS NOT NULL AND c.created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('week', c.closed_at) ORDER BY week ASC
    `, [startDate, endDate]);

    return { byAgent, byTeam, byChannel, trend };
  });

  // ── Heatmap de Volume por Hora ────────────────────────────────────────────
  fastify.get('/stats/heatmap', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { start, end } = req.query;
    const startDate = start || new Date(Date.now() - 30*24*60*60*1000).toISOString();
    const endDate = end || new Date().toISOString();

    // Messages per hour of day (0-23) and day of week (0=Sun, 6=Sat)
    const { rows } = await query(`
      SELECT
        EXTRACT(DOW FROM created_at AT TIME ZONE 'America/Sao_Paulo') as dow,
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo') as hour,
        COUNT(*) as count
      FROM messages
      WHERE created_at BETWEEN $1 AND $2 AND sender_type = 'contact'
      GROUP BY dow, hour
      ORDER BY dow, hour
    `, [startDate, endDate]);

    // Also get peak hours summary
    const { rows: peaks } = await query(`
      SELECT
        EXTRACT(HOUR FROM created_at AT TIME ZONE 'America/Sao_Paulo') as hour,
        COUNT(*) as count
      FROM messages
      WHERE created_at BETWEEN $1 AND $2 AND sender_type = 'contact'
      GROUP BY hour ORDER BY count DESC LIMIT 5
    `, [startDate, endDate]);

    return { heatmap: rows, peaks };
  });

  // ── Supervisor Live Panel ─────────────────────────────────────────────────
  fastify.get('/stats/supervisor-live', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows: agents } = await query(`
      SELECT
        p.id, p.full_name, p.status, p.avatar_url,
        COUNT(c.id) FILTER (WHERE c.status='open') as open_count,
        COUNT(c.id) FILTER (WHERE c.status='open' AND c.assigned_to=p.id) as assigned_count,
        MAX(m.created_at) FILTER (WHERE m.sender_type='agent') as last_message_at,
        COUNT(c.id) FILTER (WHERE c.status='open' AND c.last_message_at < NOW() - interval '10 minutes' AND m_last.sender_type='contact') as waiting_reply
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id
      LEFT JOIN LATERAL (
        SELECT sender_type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
      ) m_last ON true
      LEFT JOIN messages m ON m.conversation_id = c.id
      WHERE p.role IN ('agent','supervisor')
      GROUP BY p.id ORDER BY p.status DESC, open_count DESC
    `);

    const { rows: alerts } = await query(`
      SELECT c.id, ct.name as contact_name, c.assigned_to, p.full_name as agent_name,
        EXTRACT(EPOCH FROM (NOW() - c.last_message_at))/60 as minutes_waiting,
        c.priority
      FROM conversations c
      JOIN contacts ct ON ct.id = c.contact_id
      LEFT JOIN profiles p ON p.id = c.assigned_to
      WHERE c.status='open' AND c.last_message_at < NOW() - interval '15 minutes'
      ORDER BY c.last_message_at ASC LIMIT 20
    `);

    const { rows: queue } = await query(`
      SELECT COUNT(*) as unassigned FROM conversations WHERE status='open' AND assigned_to IS NULL
    `);

    return { agents, alerts, queue: queue[0] };
  });

  // ── SLA by Team ────────────────────────────────────────────────────────────
  fastify.get('/stats/sla-by-team', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query(`
      SELECT
        t.name as team_name,
        t.id as team_id,
        COUNT(c.id) as total,
        COUNT(c.id) FILTER (WHERE c.sla_deadline IS NOT NULL AND c.closed_at <= c.sla_deadline) as within_sla,
        COUNT(c.id) FILTER (WHERE c.sla_deadline IS NOT NULL AND (c.closed_at > c.sla_deadline OR (c.sla_deadline < NOW() AND c.status != 'closed'))) as breached,
        COUNT(c.id) FILTER (WHERE c.status != 'closed' AND c.sla_deadline IS NOT NULL AND c.sla_deadline < NOW()) as active_breaches,
        ROUND(AVG(EXTRACT(EPOCH FROM (COALESCE(c.first_response_at, NOW()) - c.created_at))/60)::numeric, 1) as avg_response_min
      FROM teams t
      LEFT JOIN conversations c ON c.assigned_team_id = t.id AND c.created_at > NOW() - interval '30 days'
      GROUP BY t.id, t.name
      ORDER BY breached DESC
    `);
    return rows;
  });

  // ── Retention Report ─────────────────────────────────────────────────────
  fastify.get('/stats/retention', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { months = 6 } = req.query;

    const { rows: retention } = await query(`
      WITH first_contacts AS (
        SELECT contact_id, MIN(created_at) as first_at
        FROM conversations GROUP BY contact_id
      ),
      returning AS (
        SELECT
          fc.contact_id,
          fc.first_at,
          COUNT(c.id) as total_conversations,
          MAX(c.created_at) as last_at,
          EXTRACT(DAY FROM MAX(c.created_at) - fc.first_at) as days_as_customer
        FROM first_contacts fc
        JOIN conversations c ON c.contact_id = fc.contact_id
        WHERE fc.first_at > NOW() - ($1 || ' months')::interval
        GROUP BY fc.contact_id, fc.first_at
      )
      SELECT
        COUNT(*) as total_contacts,
        COUNT(*) FILTER (WHERE total_conversations > 1) as returned,
        COUNT(*) FILTER (WHERE total_conversations = 1) as one_time,
        ROUND(COUNT(*) FILTER (WHERE total_conversations > 1)::numeric / NULLIF(COUNT(*),0) * 100, 1) as retention_rate,
        ROUND(AVG(total_conversations)::numeric, 1) as avg_conversations_per_contact,
        ROUND(AVG(days_as_customer) FILTER (WHERE total_conversations > 1)::numeric, 0) as avg_days_retained
      FROM returning
    `, [months]);

    const { rows: cohort } = await query(`
      WITH monthly_first AS (
        SELECT contact_id, DATE_TRUNC('month', MIN(created_at)) as cohort_month
        FROM conversations GROUP BY contact_id
      )
      SELECT
        TO_CHAR(mf.cohort_month, 'Mon/YY') as month,
        COUNT(DISTINCT mf.contact_id) as new_contacts,
        COUNT(DISTINCT c2.contact_id) as returned_contacts
      FROM monthly_first mf
      LEFT JOIN conversations c2 ON c2.contact_id = mf.contact_id
        AND DATE_TRUNC('month', c2.created_at) > mf.cohort_month
      WHERE mf.cohort_month > NOW() - ($1 || ' months')::interval
      GROUP BY mf.cohort_month ORDER BY mf.cohort_month ASC
    `, [months]);

    const { rows: topReturning } = await query(`
      SELECT ct.name, ct.phone, COUNT(c.id) as visits, MAX(c.created_at) as last_visit
      FROM contacts ct JOIN conversations c ON c.contact_id=ct.id
      GROUP BY ct.id, ct.name, ct.phone
      HAVING COUNT(c.id) > 2
      ORDER BY visits DESC LIMIT 10
    `);

    return { summary: retention[0], cohort, topReturning };
  });

  // ── Contact Growth Report ─────────────────────────────────────────────────
  fastify.get('/stats/contact-growth', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const period = parseInt(req.query.period || '30', 10);
    const groupBy = req.query.group_by || 'day';

    const validTrunc = { day: 'day', week: 'week', month: 'month' };
    const truncFunc = validTrunc[groupBy] || 'day';

    const { rows: growth } = await query(
      "SELECT DATE_TRUNC('" + truncFunc + "', created_at) as date, COUNT(*) as new_contacts FROM contacts WHERE created_at >= NOW() - ($1 || ' days')::interval GROUP BY 1 ORDER BY 1 ASC",
      [period]
    );

    const { rows: baseline } = await query(
      "SELECT COUNT(*) as total FROM contacts WHERE created_at < NOW() - ($1 || ' days')::interval",
      [period]
    );
    const baseCount = parseInt(baseline[0] ? baseline[0].total : '0', 10);

    let running = baseCount;
    const growthData = growth.map(function(row) {
      running += parseInt(row.new_contacts, 10);
      return { date: row.date, new_contacts: parseInt(row.new_contacts, 10), total_contacts: running };
    });

    const { rows: totalRow } = await query('SELECT COUNT(*) as total FROM contacts');
    const totalContacts = parseInt(totalRow[0].total, 10);
    const newInPeriod = growthData.reduce(function(s, r) { return s + r.new_contacts; }, 0);

    const { rows: prevPeriod } = await query(
      "SELECT COUNT(*) as total FROM contacts WHERE created_at >= NOW() - ($1 || ' days')::interval AND created_at < NOW() - ($2 || ' days')::interval",
      [period * 2, period]
    );
    const prevCount = parseInt(prevPeriod[0] ? prevPeriod[0].total : '0', 10);
    const growthRate = prevCount > 0 ? parseFloat(((newInPeriod - prevCount) / prevCount * 100).toFixed(1)) : 0;

    const peak = growthData.reduce(function(best, r) { return (!best || r.new_contacts > best.new_contacts) ? r : best; }, null);

    return {
      data: growthData,
      summary: {
        total_contacts: totalContacts,
        new_in_period: newInPeriod,
        growth_rate: growthRate,
        previous_period_count: prevCount,
        peak: peak ? { date: peak.date, new_contacts: peak.new_contacts } : null,
        period: period,
        group_by: groupBy,
      },
    };
  });

  // ── Gamification / Agent Ranking ─────────────────────────────────────────
  fastify.get('/stats/gamification', { onRequest: [fastify.authenticate] }, async (req, reply) => {
    const { rows } = await query(`
      SELECT
        p.id, p.full_name, p.avatar_url,
        (COUNT(c.id) FILTER (WHERE c.status='closed' AND c.closed_at > NOW() - interval '7 days') * 10) +
        (COALESCE(ROUND(AVG(c.csat_score) FILTER (WHERE c.csat_score IS NOT NULL AND c.closed_at > NOW() - interval '7 days'))::int, 0) * 5) +
        (COUNT(c.id) FILTER (WHERE c.status='closed' AND c.closed_at > NOW() - interval '7 days' AND c.first_response_at IS NOT NULL AND EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)) < 300) * 3) as points_week,
        COUNT(c.id) FILTER (WHERE c.status='closed' AND c.closed_at > NOW() - interval '7 days') as closed_week,
        COUNT(c.id) FILTER (WHERE c.status='closed') as closed_total,
        ROUND(AVG(c.csat_score) FILTER (WHERE c.csat_score IS NOT NULL)::numeric, 1) as avg_csat,
        ROUND(AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at))/60) FILTER (WHERE c.first_response_at IS NOT NULL)::numeric, 1) as avg_response_min
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id
      WHERE p.role IN ('agent','supervisor')
      GROUP BY p.id ORDER BY points_week DESC
    `);

    const withBadges = rows.map((agent, idx) => {
      const badges = [];
      if (idx === 0) badges.push({ id: 'top1', label: '🥇 Top Agente', color: 'gold' });
      if (idx === 1) badges.push({ id: 'top2', label: '🥈 2º Lugar', color: 'silver' });
      if (idx === 2) badges.push({ id: 'top3', label: '🥉 3º Lugar', color: 'bronze' });
      if (agent.avg_csat >= 4.5) badges.push({ id: 'csat_star', label: '⭐ Mestre CSAT', color: 'yellow' });
      if (agent.avg_response_min < 5) badges.push({ id: 'speed', label: '⚡ Relâmpago', color: 'blue' });
      if (agent.closed_week >= 20) badges.push({ id: 'closer', label: '🎯 Fechador', color: 'green' });
      return { ...agent, badges, rank: idx + 1 };
    });

    return withBadges;
  });

  // ── Word Cloud ────────────────────────────────────────────────────────────
  fastify.get('/stats/word-cloud', auth, async (req) => {
    const { days = '30', channel = '', direction = 'inbound' } = req.query;
    const daysInt = Math.min(Math.max(parseInt(days) || 30, 1), 365);

    const stopwords = new Set([
      'a','o','e','de','da','do','em','um','uma','para','por','com','que','se',
      'na','no','ao','os','as','me','te','você','voce','não','nao','sim','é','e',
      'são','sao','foi','ser','ter','mas','mas','ou','já','ja','também','tambem',
      'bem','mais','muito','sua','seu','suas','seus','ela','ele','eles','elas',
      'nos','num','numa','dum','duma','tudo','isso','este','esta','esse','essa',
      'aqui','ali','lá','la','quando','como','onde','pelo','pela','pelos','pelas',
      'desde','até','ate','sobre','entre','então','entao','depois','antes',
      'agora','hoje','ontem','teu','tua','meu','minha','nosso','nossa','vou',
      'vai','tem','têm','tem','estou','está','esta','estão','estar','faz','fazer',
      'diz','disse','falar','pode','podia','vejo','ver','sei','sabe','sabia','boa',
      'bom','obrigado','obrigada','ok','sim','não','tá','ta','né','ne','aí','ai',
    ]);

    const params = [daysInt];
    let dirCond = '';
    if (direction === 'inbound') dirCond = "AND m.sender_type = 'contact'";
    else if (direction === 'outbound') dirCond = "AND m.sender_type IN ('agent','bot')";

    let chanCond = '';
    if (channel) { params.push(channel); chanCond = `AND c.connection_name = $${params.length}`; }

    const { rows } = await query(`
      SELECT m.content FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE m.created_at > NOW() - ($1 || ' days')::INTERVAL
        AND m.content IS NOT NULL
        AND m.sender_type != 'system'
        ${dirCond}
        ${chanCond}
      LIMIT 50000
    `, params);

    const wordCount = {};
    for (const row of rows) {
      const words = (row.content || '').toLowerCase()
        .replace(/[^a-záàâãéèêíïóôõöúüçñ\s]/gi, ' ')
        .split(/\s+/);
      for (const w of words) {
        if (w.length < 3) continue;
        if (stopwords.has(w)) continue;
        wordCount[w] = (wordCount[w] || 0) + 1;
      }
    }

    const result = Object.entries(wordCount)
      .filter(([, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([word, count]) => ({ word, count }));

    return result;
  });

  // ── My Productivity ───────────────────────────────────────────────────────

  fastify.get('/stats/my-productivity', auth, async (req) => {
    const userId = req.user.id;

    // Today stats
    const { rows: todayRows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open_conversations,
        COUNT(*) FILTER (WHERE status = 'closed' AND DATE(closed_at) = CURRENT_DATE)::int AS closed_today,
        ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))/60) FILTER (
          WHERE first_response_at IS NOT NULL AND DATE(created_at) = CURRENT_DATE
        )::numeric, 1) AS avg_response_min_today
      FROM conversations
      WHERE assigned_to = $1
    `, [userId]);

    const { rows: msgToday } = await query(`
      SELECT COUNT(*)::int AS sent_today
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.assigned_to = $1 AND DATE(m.created_at) = CURRENT_DATE AND m.direction = 'outbound'
    `, [userId]);

    // Week stats
    const { rows: weekRows } = await query(`
      SELECT
        COUNT(*) FILTER (WHERE status IN ('open','in_progress'))::int AS open_conversations,
        COUNT(*) FILTER (WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '7 days')::int AS closed_week,
        ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))/60) FILTER (
          WHERE first_response_at IS NOT NULL AND created_at >= NOW() - INTERVAL '7 days'
        )::numeric, 1) AS avg_response_min_week
      FROM conversations
      WHERE assigned_to = $1
    `, [userId]);

    const { rows: msgWeek } = await query(`
      SELECT COUNT(*)::int AS sent_week
      FROM messages m
      JOIN conversations c ON c.id = m.conversation_id
      WHERE c.assigned_to = $1 AND m.created_at >= NOW() - INTERVAL '7 days' AND m.direction = 'outbound'
    `, [userId]);

    // Goal
    const { rows: goalRows } = await query(
      'SELECT * FROM productivity_goals WHERE agent_id = $1',
      [userId]
    );

    // Ranking (conversations closed this month)
    const { rows: rankRows } = await query(`
      SELECT agent_id, COUNT(*) AS closed_month,
        RANK() OVER (ORDER BY COUNT(*) DESC) AS rank
      FROM conversations
      WHERE status = 'closed' AND closed_at >= DATE_TRUNC('month', NOW())
      GROUP BY agent_id
    `);
    const myRank = rankRows.find(r => r.agent_id === userId);

    // History: last 30 days
    const { rows: historyRows } = await query(`
      SELECT
        DATE(closed_at) AS date,
        COUNT(*)::int AS conversations_closed,
        ROUND(AVG(EXTRACT(EPOCH FROM (first_response_at - created_at))/60) FILTER (
          WHERE first_response_at IS NOT NULL
        )::numeric, 1) AS avg_response_min
      FROM conversations
      WHERE assigned_to = $1 AND status = 'closed' AND closed_at >= NOW() - INTERVAL '30 days'
      GROUP BY DATE(closed_at)
      ORDER BY date ASC
    `, [userId]);

    const t = todayRows[0] || {};
    const w = weekRows[0] || {};
    const g = goalRows[0] || { daily_conversations: 10, weekly_conversations: 50 };

    return {
      today: {
        open_conversations: t.open_conversations || 0,
        closed_conversations: t.closed_today || 0,
        messages_sent: (msgToday[0] || {}).sent_today || 0,
        avg_response_min: t.avg_response_min_today ? parseFloat(t.avg_response_min_today) : null,
      },
      week: {
        open_conversations: w.open_conversations || 0,
        closed_conversations: w.closed_week || 0,
        messages_sent: (msgWeek[0] || {}).sent_week || 0,
        avg_response_min: w.avg_response_min_week ? parseFloat(w.avg_response_min_week) : null,
      },
      goal: {
        daily_conversations: parseInt(g.daily_conversations) || 10,
        weekly_conversations: parseInt(g.weekly_conversations) || 50,
      },
      ranking: {
        position: myRank ? parseInt(myRank.rank) : null,
        total_closed_month: myRank ? parseInt(myRank.closed_month) : 0,
        total_agents: rankRows.length,
      },
      history: historyRows.map(r => ({
        date: r.date,
        conversations_closed: r.conversations_closed,
        avg_response_min: r.avg_response_min ? parseFloat(r.avg_response_min) : null,
      })),
    };
  });

  fastify.get('/stats/my-productivity/goals', auth, async (req) => {
    const { rows } = await query(
      'SELECT * FROM productivity_goals WHERE agent_id = $1',
      [req.user.id]
    );
    return rows[0] || { agent_id: req.user.id, daily_conversations: 10, weekly_conversations: 50 };
  });

  fastify.put('/stats/my-productivity/goals', auth, async (req, reply) => {
    const { daily_conversations, weekly_conversations } = req.body;
    const { rows } = await query(`
      INSERT INTO productivity_goals (agent_id, daily_conversations, weekly_conversations)
      VALUES ($1, $2, $3)
      ON CONFLICT (agent_id) DO UPDATE
        SET daily_conversations = EXCLUDED.daily_conversations,
            weekly_conversations = EXCLUDED.weekly_conversations
      RETURNING *
    `, [req.user.id, parseInt(daily_conversations) || 10, parseInt(weekly_conversations) || 50]);
    return rows[0];
  });

  // ── Campaign ROI ──────────────────────────────────────────────────────────
  fastify.get('/stats/campaign-roi/:campaignId', auth, async (req) => {
    const { campaignId } = req.params;

    // Buscar campanha
    const { rows: campaigns } = await query(
      'SELECT id, name, created_at, dispatched_at FROM campaigns WHERE id=$1',
      [campaignId]
    );
    if (!campaigns[0]) return { error: 'Campanha não encontrada' };
    const campaign = campaigns[0];
    const sentAt = campaign.dispatched_at || campaign.created_at;

    // Contar total enviado (recipients)
    const { rows: sentRows } = await query(
      'SELECT COUNT(*) as cnt FROM campaign_recipients WHERE campaign_id=$1',
      [campaignId]
    );
    const sent_count = parseInt(sentRows[0]?.cnt || '0');

    // Contatos da campanha
    const { rows: contactRows } = await query(
      'SELECT DISTINCT contact_id FROM campaign_recipients WHERE campaign_id=$1',
      [campaignId]
    );
    const contactIds = contactRows.map(r => r.contact_id).filter(Boolean);

    let response_count = 0;
    let conversations_opened = 0;
    let pix_charges_count = 0;
    let pix_revenue = 0;

    if (contactIds.length > 0) {
      const idList = contactIds.map((_, i) => `$${i + 2}`).join(',');

      // Contar quem respondeu (mensagem inbound após o envio)
      const { rows: respRows } = await query(
        `SELECT COUNT(DISTINCT c.contact_id) as cnt
         FROM conversations c
         JOIN messages m ON m.conversation_id = c.id
         WHERE c.contact_id IN (${idList})
           AND m.direction = 'inbound'
           AND m.created_at > $1`,
        [sentAt, ...contactIds]
      );
      response_count = parseInt(respRows[0]?.cnt || '0');

      // Conversas abertas após a campanha
      const { rows: convRows } = await query(
        `SELECT COUNT(*) as cnt FROM conversations
         WHERE contact_id IN (${idList}) AND created_at > $1`,
        [sentAt, ...contactIds]
      );
      conversations_opened = parseInt(convRows[0]?.cnt || '0');

      // Cobranças Pix criadas após a campanha
      const { rows: pixRows } = await query(
        `SELECT COUNT(*) as cnt, COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END), 0) as revenue
         FROM pix_charges
         WHERE contact_id IN (${idList}) AND created_at > $1`,
        [sentAt, ...contactIds]
      );
      pix_charges_count = parseInt(pixRows[0]?.cnt || '0');
      pix_revenue = parseFloat(pixRows[0]?.revenue || '0');
    }

    const response_rate = sent_count > 0 ? Math.round((response_count / sent_count) * 100) : 0;

    return {
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      sent_count,
      response_count,
      response_rate,
      conversations_opened,
      pix_charges_count,
      pix_revenue,
      period: { start: sentAt, end: new Date().toISOString() },
    };
  });

  fastify.get('/stats/campaigns-roi-summary', auth, async (req) => {
    const days = parseInt(req.query.days) || 30;
    const { rows: campaigns } = await query(
      `SELECT id, name, created_at, dispatched_at
       FROM campaigns
       WHERE (dispatched_at IS NOT NULL OR status='sent')
         AND COALESCE(dispatched_at, created_at) >= NOW() - ($1 || ' days')::interval
       ORDER BY COALESCE(dispatched_at, created_at) DESC
       LIMIT 50`,
      [days]
    );

    const results = await Promise.all(campaigns.map(async (campaign) => {
      const sentAt = campaign.dispatched_at || campaign.created_at;

      const { rows: sentRows } = await query(
        'SELECT COUNT(*) as cnt FROM campaign_recipients WHERE campaign_id=$1',
        [campaign.id]
      );
      const sent_count = parseInt(sentRows[0]?.cnt || '0');

      const { rows: contactRows } = await query(
        'SELECT DISTINCT contact_id FROM campaign_recipients WHERE campaign_id=$1',
        [campaign.id]
      );
      const contactIds = contactRows.map(r => r.contact_id).filter(Boolean);

      let response_count = 0;
      let pix_revenue = 0;
      let pix_charges_count = 0;

      if (contactIds.length > 0) {
        const idList = contactIds.map((_, i) => `$${i + 2}`).join(',');

        const { rows: rr } = await query(
          `SELECT COUNT(DISTINCT c.contact_id) as cnt FROM conversations c
           JOIN messages m ON m.conversation_id = c.id
           WHERE c.contact_id IN (${idList}) AND m.direction='inbound' AND m.created_at > $1`,
          [sentAt, ...contactIds]
        );
        response_count = parseInt(rr[0]?.cnt || '0');

        const { rows: pr } = await query(
          `SELECT COUNT(*) as cnt, COALESCE(SUM(CASE WHEN status='paid' THEN amount ELSE 0 END),0) as revenue
           FROM pix_charges WHERE contact_id IN (${idList}) AND created_at > $1`,
          [sentAt, ...contactIds]
        );
        pix_charges_count = parseInt(pr[0]?.cnt || '0');
        pix_revenue = parseFloat(pr[0]?.revenue || '0');
      }

      return {
        campaign_id: campaign.id,
        campaign_name: campaign.name,
        sent_at: sentAt,
        sent_count,
        response_count,
        response_rate: sent_count > 0 ? Math.round((response_count / sent_count) * 100) : 0,
        pix_charges_count,
        pix_revenue,
      };
    }));

    return results;
  });

  // ── Public Agent Profile ──────────────────────────────────────────────────
  fastify.get('/public/agent/:id', async (req, reply) => {
    const { rows } = await query(`
      SELECT
        p.id, p.full_name, p.name, p.avatar_url, p.role, p.bio,
        COUNT(c.id) FILTER (WHERE c.status = 'closed') AS total_conversations_closed,
        ROUND(AVG(c.csat_score) FILTER (WHERE c.status = 'closed' AND c.csat_score IS NOT NULL)::numeric, 2) AS average_csat
      FROM profiles p
      LEFT JOIN conversations c ON c.assigned_to = p.id
      WHERE p.id = $1
      GROUP BY p.id
    `, [req.params.id]);
    if (!rows[0]) return reply.status(404).send({ error: 'Agente não encontrado' });
    const agent = rows[0];
    return {
      id: agent.id,
      full_name: agent.full_name || agent.name,
      avatar_url: agent.avatar_url,
      role: agent.role,
      bio: agent.bio,
      average_csat: agent.average_csat ? parseFloat(agent.average_csat) : null,
      total_conversations_closed: parseInt(agent.total_conversations_closed) || 0,
    };
  });
}
