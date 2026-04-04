/**
 * Supabase compatibility shim — redireciona chamadas para a nova API REST.
 * Mantém a mesma interface do supabase-js para compatibilidade com páginas existentes.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function apiFetch(method: string, path: string, body?: unknown): Promise<unknown> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    const refreshToken = localStorage.getItem('refresh_token');
    if (refreshToken) {
      const rr = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (rr.ok) {
        const d = await rr.json();
        localStorage.setItem('auth_token', d.token);
        localStorage.setItem('refresh_token', d.refreshToken);
        const r2 = await fetch(`${BASE_URL}${path}`, {
          method,
          headers: { ...headers, Authorization: `Bearer ${d.token}` },
          body: body !== undefined ? JSON.stringify(body) : undefined,
        });
        if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || r2.statusText);
        return r2.json().catch(() => null);
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Maps Supabase table names → API endpoints
const TABLE_MAP: Record<string, string> = {
  profiles: '/users',
  settings: '/settings',
  evolution_connections: '/evolution-connections',
  zapi_connections: '/zapi-connections',
  tags: '/tags',
  categories: '/categories',
  contacts: '/contacts',
  conversations: '/conversations',
  messages: '/messages',
  quick_replies: '/quick-replies',
  notifications: '/notifications',
  campaigns: '/campaigns',
  campaign_contacts: '/campaign-contacts',
  opportunities: '/opportunities',
  chatbot_rules: '/chatbot-rules',
  chatbot_sessions: '/chatbot-sessions',
  schedules: '/schedules',
  queues: '/queues',
  queue_agents: '/queue-agents',
  webhooks: '/webhooks',
  webhook_logs: '/webhook-logs',
  sla_rules: '/sla-rules',
  reviews: '/reviews',
  activity_log: '/activity-log',
  followup_reminders: '/followup-reminders',
  api_tokens: '/api-tokens',
  hsm_templates: '/hsm-templates',
  segments: '/segments',
  contact_groups: '/contact-groups',
  contact_group_members: '/contact-group-members',
  blacklist: '/blacklist',
  agent_schedules: '/agent-schedules',
  proposals: '/proposals',
  sales_goals: '/sales-goals',
  conversation_transfers: '/conversation-transfers',
  auto_distribution_config: '/auto-distribution-config',
  whatsapp_statuses: '/whatsapp-statuses',
  contact_forms: '/contact-forms',
  attendance_flow_templates: '/flow-templates',
  conversation_notes: '/conversation-notes',
  conversation_labels: '/conversation-labels',
  internal_messages: '/internal-messages',
  internal_channels: '/internal-channels',
  internal_conversations: '/internal-channels',
  products: '/products',
  tasks: '/tasks',
  kanban_boards: '/kanban-boards',
  kanban_columns: '/kanban-columns',
  kanban_cards: '/kanban-cards',
  user_roles: '/__skip__',
  contact_tags: '/contact-tags',
  event_triggers: '/event-triggers',
  intent_configs: '/intent-configs',
  lead_scoring_rules: '/lead-scoring-rules',
  contact_segments: '/contact-segments',
  message_templates: '/message-templates',
  whatsapp_cloud_connections: '/__skip__',
  reseller_plans: '/__skip__',
  reseller_accounts: '/__skip__',
  subscriptions: '/__skip__',
  reseller_sub_users: '/__skip__',
  reseller_transactions: '/__skip__',
};

type FilterOp = { col: string; val: unknown; op: string };

class QueryBuilder {
  private _table: string;
  private _endpoint: string;
  private _method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT' = 'GET';
  private _body: unknown = undefined;
  private _filters: FilterOp[] = [];
  private _orderCol?: string;
  private _orderAsc = true;
  private _limitN?: number;
  private _selectCols?: string;
  private _isSingle = false;
  private _isMaybeSingle = false;
  private _returnSelect = false;
  private _upsert = false;
  private _idFilter?: string;
  private _countOnly = false;

  constructor(table: string) {
    this._table = table;
    this._endpoint = TABLE_MAP[table] || `/${table.replace(/_/g, '-')}`;
  }

  select(cols?: string, opts?: { count?: string; head?: boolean }) {
    this._selectCols = cols;
    if (opts?.head) this._countOnly = true;
    // Only switch to GET if no write method was set — allows insert().select() pattern
    if (this._method !== 'POST' && this._method !== 'PATCH' && this._method !== 'DELETE') {
      this._method = 'GET';
    }
    return this;
  }
  insert(data: unknown) { this._method = 'POST'; this._body = data; return this; }
  update(data: unknown) { this._method = 'PATCH'; this._body = data; return this; }
  delete() { this._method = 'DELETE'; return this; }
  upsert(data: unknown, _opts?: unknown) { this._method = 'POST'; this._body = data; this._upsert = true; return this; }

  eq(col: string, val: unknown) {
    if (col === 'id') { this._idFilter = String(val); }
    this._filters.push({ col, val, op: 'eq' });
    return this;
  }
  neq(col: string, val: unknown) { this._filters.push({ col, val, op: 'neq' }); return this; }
  gt(col: string, val: unknown) { this._filters.push({ col, val, op: 'gt' }); return this; }
  gte(col: string, val: unknown) { this._filters.push({ col, val, op: 'gte' }); return this; }
  lt(col: string, val: unknown) { this._filters.push({ col, val, op: 'lt' }); return this; }
  lte(col: string, val: unknown) { this._filters.push({ col, val, op: 'lte' }); return this; }
  ilike(col: string, val: unknown) { this._filters.push({ col, val, op: 'ilike' }); return this; }
  like(col: string, val: unknown) { this._filters.push({ col, val, op: 'ilike' }); return this; }
  is(col: string, val: unknown) { this._filters.push({ col, val, op: 'is' }); return this; }
  not(col: string, op: string, val: unknown) { this._filters.push({ col, val, op: `not_${op}` }); return this; }
  in(col: string, vals: unknown[]) { this._filters.push({ col, val: vals, op: 'in' }); return this; }
  contains(col: string, val: unknown) { this._filters.push({ col, val, op: 'contains' }); return this; }
  overlaps(col: string, val: unknown) { this._filters.push({ col, val, op: 'overlaps' }); return this; }
  filter(col: string, op: string, val: unknown) { this._filters.push({ col, val, op }); return this; }
  textSearch(col: string, query: string) { this._filters.push({ col, val: query, op: 'search' }); return this; }
  or(filter: string) {
    // Parse "col.ilike.%term%" patterns and extract as search
    const m = filter.match(/\.ilike\.%([^%,]+)%/);
    if (m) this._filters.push({ col: 'search', val: m[1], op: 'eq' });
    return this;
  }

  order(col: string, opts?: { ascending?: boolean }) {
    this._orderCol = col;
    this._orderAsc = opts?.ascending ?? true;
    return this;
  }
  limit(n: number) { this._limitN = n; return this; }
  range(_from: number, _to: number) { return this; }

  single() { this._isSingle = true; return this; }
  maybeSingle() { this._isMaybeSingle = true; return this; }

  // After insert, chain .select()
  // We handle this differently — see _execute

  then(resolve?: (val: unknown) => unknown, reject?: (err: unknown) => unknown): Promise<unknown> {
    return this._execute().then(resolve, reject);
  }

  private async _execute(): Promise<{ data: unknown; error: unknown }> {
    if (this._endpoint === '/__skip__') {
      return { data: [], error: null };
    }

    try {
      let url = this._endpoint;
      const qs: Record<string, string> = {};

      if (this._method === 'GET') {
        // Build query string from filters
        for (const f of this._filters) {
          if (f.col === 'id' && f.op === 'eq') {
            url = `${url}/${f.val}`;
          } else {
            qs[`${f.col}`] = String(f.val);
          }
        }
        if (this._orderCol) qs['order'] = this._orderAsc ? this._orderCol : `-${this._orderCol}`;
        if (this._limitN) qs['limit'] = String(this._limitN);

        const qStr = Object.entries(qs).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        if (qStr) url += `?${qStr}`;

        const data = await apiFetch('GET', url);
        const normalized = this._normalizeGetResult(data);
        if (this._countOnly) {
          const count = Array.isArray(normalized) ? normalized.length : (typeof normalized === 'number' ? normalized : 0);
          return { data: null, count, error: null };
        }
        return { data: normalized, error: null };
      }

      if (this._method === 'POST') {
        if (this._idFilter) url = `${url}/${this._idFilter}`;
        const data = await apiFetch('POST', url, this._body);
        return { data, error: null };
      }

      if (this._method === 'PATCH') {
        const idF = this._filters.find(f => f.col === 'id' && f.op === 'eq');
        const inF = this._filters.find(f => f.col === 'id' && f.op === 'in');
        if (idF) {
          url = `${url}/${idF.val}`;
        } else if (inF) {
          // Bulk update: pass ids as comma-separated query param
          const ids = Array.isArray(inF.val) ? (inF.val as unknown[]).join(',') : String(inF.val);
          url += `?ids=${encodeURIComponent(ids)}`;
        } else if (this._filters.length > 0) {
          // Non-id filters (e.g., user_id + instance_name): pass as query params
          const qParts = this._filters.map(f => `${encodeURIComponent(f.col)}=${encodeURIComponent(String(f.val))}`);
          url += `?${qParts.join('&')}`;
        }
        const data = await apiFetch('PATCH', url, this._body);
        return { data, error: null };
      }

      if (this._method === 'DELETE') {
        const idF = this._filters.find(f => f.col === 'id' && f.op === 'eq');
        if (idF) {
          url = `${url}/${idF.val}`;
        } else {
          // For junction tables with no id, pass filters as query params
          const qParts = this._filters.map(f => `${encodeURIComponent(f.col)}=${encodeURIComponent(String(f.val))}`);
          if (qParts.length) url += `?${qParts.join('&')}`;
        }
        const data = await apiFetch('DELETE', url);
        return { data, error: null };
      }

      return { data: null, error: new Error('Unsupported method') };
    } catch (err) {
      return { data: null, error: err };
    }
  }

  private _normalizeGetResult(data: unknown) {
    // Unwrap paginated responses: { data: [...], total: N, ... }
    if (data && typeof data === 'object' && !Array.isArray(data) && Array.isArray((data as any).data)) {
      data = (data as any).data;
    }
    if (this._isSingle) {
      if (Array.isArray(data)) return data[0] || null;
      return data;
    }
    if (this._isMaybeSingle) {
      if (Array.isArray(data)) return data[0] || null;
      return data || null;
    }
    if (Array.isArray(data)) return data;
    // Some endpoints return objects (like settings, stats)
    return data;
  }
}

// ── Storage shim ──────────────────────────────────────────────────────────────
class StorageBucketProxy {
  private bucket: string;
  constructor(bucket: string) { this.bucket = bucket; }

  async upload(path: string, file: File | Blob, _opts?: unknown) {
    const token = getToken();
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch(`${BASE_URL}/upload/${this.bucket}/${path}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    });
    if (!res.ok) return { data: null, error: new Error(res.statusText) };
    const data = await res.json();
    return { data, error: null };
  }

  getPublicUrl(path: string) {
    return { data: { publicUrl: `${BASE_URL}/files/${this.bucket}/${path}` } };
  }
  async remove(paths: string[]) { return { data: paths, error: null }; }
  async list(_folder?: string) { return { data: [], error: null }; }
}

// ── Realtime shim ─────────────────────────────────────────────────────────────
class ChannelProxy {
  on(_event: string, _filter: unknown, _callback?: unknown) { return this; }
  subscribe(_cb?: unknown) { return this; }
  unsubscribe() {}
}

// ── Auth shim ─────────────────────────────────────────────────────────────────
const authShim = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, error: { message: err.error || 'Credenciais inválidas' } };
      }
      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      // Get user profile
      const me = await apiFetch('GET', '/auth/me').catch(() => null) as Record<string, unknown> | null;
      const session = me ? { user: { id: me.id, email: me.email } } : null;
      return { data: { session }, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  },

  async signUp({ email, password, options }: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
    try {
      const res = await fetch(`${BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name: options?.data?.name || options?.data?.full_name || email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, error: { message: err.error || 'Erro ao criar conta' } };
      }
      const data = await res.json();
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      return { data: { user: { id: data.user?.id, email } }, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  },

  async signOut() {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('refresh_token');
    return { error: null };
  },

  async getSession() {
    const token = localStorage.getItem('auth_token');
    if (!token) return { data: { session: null }, error: null };
    try {
      const me = await apiFetch('GET', '/auth/me') as Record<string, unknown>;
      return { data: { session: { user: { id: me.id, email: me.email, user_metadata: { name: me.name } } } }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async getUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) return { data: { user: null }, error: null };
    try {
      const me = await apiFetch('GET', '/auth/me') as Record<string, unknown>;
      return { data: { user: { id: me.id, email: me.email } }, error: null };
    } catch {
      return { data: { user: null }, error: null };
    }
  },

  async updateUser(attrs: { data?: Record<string, unknown>; password?: string }) {
    try {
      if (attrs.password) {
        await apiFetch('POST', '/auth/change-password', { newPassword: attrs.password });
      }
      if (attrs.data) {
        await apiFetch('PATCH', '/auth/me', attrs.data);
      }
      return { data: {}, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  },

  async resetPasswordForEmail(_email: string) {
    return { data: {}, error: null };
  },

  onAuthStateChange(callback: (event: string, session: unknown) => void) {
    // Fire immediately with current state
    const token = localStorage.getItem('auth_token');
    if (token) {
      apiFetch('GET', '/auth/me').then(me => {
        callback('SIGNED_IN', { user: { id: (me as Record<string, unknown>)?.id, email: (me as Record<string, unknown>)?.email } });
      }).catch(() => callback('SIGNED_OUT', null));
    } else {
      setTimeout(() => callback('SIGNED_OUT', null), 0);
    }
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
};

// ── Functions shim ────────────────────────────────────────────────────────────
const FUNCTION_MAP: Record<string, string> = {
  'manage-users': '/users',
  'ai-agent': '/ai-agent',
  'evolution-api': '/evolution-proxy',
  'zapi': '/zapi-proxy',
};

const functionsShim = {
  async invoke(fnName: string, options?: { body?: unknown; method?: string; headers?: Record<string, string> }) {
    const endpoint = FUNCTION_MAP[fnName];
    if (!endpoint) {
      // Unknown function — return stub without crashing
      return { data: null, error: null };
    }
    try {
      const method = options?.method || 'POST';
      const data = await apiFetch(method as 'GET' | 'POST', endpoint, options?.body);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  },
};

// ── Main supabase shim object ─────────────────────────────────────────────────
export const supabase = {
  from: (table: string) => new QueryBuilder(table),

  auth: authShim,

  storage: {
    from: (bucket: string) => new StorageBucketProxy(bucket),
  },

  functions: functionsShim,

  channel: (_name: string) => new ChannelProxy(),
  removeChannel: (_ch: unknown) => {},
  removeAllChannels: () => {},

  rpc: async (fn: string, args?: unknown) => {
    try {
      const data = await apiFetch('POST', `/rpc/${fn}`, args);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: err };
    }
  },
};

export default supabase;
