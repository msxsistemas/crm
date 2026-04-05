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
    const connCond = connection !== 'all' ? `AND instance_name = $${filterParams.push(connection)}` : '';
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
            WHERE m.conversation_id = c.id AND m.from_me = false
          ) fi ON fi.t IS NOT NULL
          JOIN LATERAL (
            SELECT MIN(m.created_at) AS t FROM messages m
            WHERE m.conversation_id = c.id AND m.from_me = true AND m.created_at > fi.t
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
            WHERE m.conversation_id = c.id AND m.from_me = false
          ) fi ON fi.t IS NOT NULL
          JOIN LATERAL (
            SELECT MIN(m.created_at) AS t FROM messages m
            WHERE m.conversation_id = c.id AND m.from_me = true AND m.created_at > fi.t
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
          SELECT c.instance_name,
            COUNT(*) FILTER (WHERE m.from_me = true) AS sent,
            COUNT(*) FILTER (WHERE m.from_me = false) AS received
          FROM messages m
          JOIN conversations c ON c.id = m.conversation_id
          WHERE m.created_at >= $1 AND m.created_at <= $2
          GROUP BY c.instance_name
        ),
        conv_stats AS (
          SELECT instance_name,
            COUNT(*) FILTER (WHERE created_at >= $1 AND created_at <= $2) AS created,
            COUNT(*) FILTER (WHERE status IN ('closed','resolved') AND updated_at >= $1 AND updated_at <= $2) AS resolved
          FROM conversations GROUP BY instance_name
        )
        SELECT
          ec.id, ec.instance_name, ec.status,
          COALESCE(ms.sent, 0) AS sent,
          COALESCE(ms.received, 0) AS received,
          COALESCE(cs.created, 0) AS created,
          COALESCE(cs.resolved, 0) AS resolved
        FROM evolution_connections ec
        LEFT JOIN msg_stats ms ON ms.instance_name = ec.instance_name
        LEFT JOIN conv_stats cs ON cs.instance_name = ec.instance_name
      `, [start, end]),

      // 9. Profiles list for selectors
      query(`SELECT id, full_name, email, status FROM profiles ORDER BY full_name NULLS LAST`),

      // 10. Total sent/received messages in period
      query(`
        SELECT
          COUNT(*) FILTER (WHERE from_me = true) AS sent,
          COUNT(*) FILTER (WHERE from_me = false) AS received
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
            JOIN LATERAL (SELECT MIN(m.created_at) AS t FROM messages m WHERE m.conversation_id = c.id AND m.from_me = false) fi ON fi.t IS NOT NULL
            JOIN LATERAL (SELECT MIN(m.created_at) AS t FROM messages m WHERE m.conversation_id = c.id AND m.from_me = true AND m.created_at > fi.t) fr ON fr.t IS NOT NULL
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
}
