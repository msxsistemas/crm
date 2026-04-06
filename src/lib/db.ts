/**
 * DB client — abstração sobre a API REST do backend.
 */

const BASE_URL = import.meta.env.VITE_API_URL || 'https://api.msxzap.pro';

function getCsrfToken(): string | null {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

async function apiFetch(method: string, path: string, body?: unknown): Promise<unknown> {
  const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (!SAFE_METHODS.has(method)) {
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    credentials: 'include',
    cache: 'no-store',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    const rr = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
    });
    if (rr.ok) {
      const r2 = await fetch(`${BASE_URL}${path}`, {
        method,
        headers,
        credentials: 'include',
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!r2.ok) throw new Error((await r2.json().catch(() => ({}))).error || r2.statusText);
      return r2.json().catch(() => null);
    }
    const onLoginPage = ['/login', '/admin/login', '/revenda/login'].some(p => window.location.pathname.startsWith(p));
    if (!onLoginPage) window.location.href = '/login';
    throw new Error('Sessão expirada');
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Maps table names → API endpoints
const TABLE_MAP: Record<string, string> = {
  profiles: '/users',
  settings: '/settings',
  evolution_connections: '/evolution-connections',
  connections: '/evolution-connections',
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
  custom_reports: '/__skip__',
  distribution_log: '/__skip__',
  help_articles: '/__skip__',
  message_reactions: '/__skip__',
  scheduled_reports: '/__skip__',
  system_settings: '/__skip__',
  user_activity_logs: '/__skip__',
  business_hours: '/__skip__',
  business_hours_config: '/__skip__',
  ai_knowledge_base: '/__skip__',
  ai_agent_config: '/__skip__',
  gateway_configs: '/__skip__',
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
          const ids = Array.isArray(inF.val) ? (inF.val as unknown[]).join(',') : String(inF.val);
          url += `?ids=${encodeURIComponent(ids)}`;
        } else if (this._filters.length > 0) {
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
    return data;
  }
}

// ── Storage ───────────────────────────────────────────────────────────────────
class StorageBucketProxy {
  private bucket: string;
  constructor(bucket: string) { this.bucket = bucket; }

  async upload(path: string, file: File | Blob, _opts?: unknown) {
    const fd = new FormData();
    fd.append('file', file);
    const headers: Record<string, string> = {};
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const res = await fetch(`${BASE_URL}/upload/${this.bucket}/${path}`, {
      method: 'POST',
      headers,
      credentials: 'include',
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

// ── Realtime ──────────────────────────────────────────────────────────────────
type PgChangesFilter = { event?: string; schema?: string; table?: string; filter?: string };
type PgChangesCallback = (payload: { eventType: string; new: unknown; old: unknown }) => void;

interface StoredListener {
  event: string;
  filter: PgChangesFilter;
  callback: PgChangesCallback;
}

class ChannelProxy {
  private _channelName: string;
  private _listeners: StoredListener[] = [];
  private _presenceListeners: Array<{ event: string; callback: () => void }> = [];
  private _socketHandlers: Array<{ event: string; handler: (...args: unknown[]) => void }> = [];
  private _isTypingChannel: boolean;
  private _conversationId: string | null;
  private _typingState: Map<string, { user_id: string; user_name: string }> = new Map();

  constructor(name: string) {
    this._channelName = name;
    const typingMatch = name.match(/^typing:(.+)$/);
    this._isTypingChannel = !!typingMatch;
    this._conversationId = typingMatch ? typingMatch[1] : null;
  }

  on(event: string, filter: unknown, callback?: unknown) {
    if (event === 'postgres_changes' && typeof callback === 'function') {
      this._listeners.push({ event, filter: (filter as PgChangesFilter) || {}, callback: callback as PgChangesCallback });
    } else if (event === 'presence' && typeof callback === 'function') {
      const filterObj = filter as { event?: string } | null;
      this._presenceListeners.push({ event: filterObj?.event || '*', callback: callback as () => void });
    }
    return this;
  }

  subscribe(cb?: (status: string) => void) {
    import('./socket').then(({ getSocket }) => {
      try {
        const s = getSocket();

        if (this._isTypingChannel && this._conversationId) {
          // Join conversation room
          s.emit('join:conversation', this._conversationId);

          // Listen for typing updates from other users
          const typingHandler = (data: { userId: string; userName?: string; typing: boolean }) => {
            if (data.typing) {
              this._typingState.set(data.userId, { user_id: data.userId, user_name: data.userName || 'Agente' });
            } else {
              this._typingState.delete(data.userId);
            }
            // Trigger presence sync listeners
            for (const l of this._presenceListeners) {
              if (l.event === 'sync' || l.event === '*') l.callback();
            }
          };

          this._socketHandlers.push({ event: 'typing:update', handler: typingHandler as (...args: unknown[]) => void });
          s.on('typing:update', typingHandler as (...args: unknown[]) => void);
        } else {
          for (const listener of this._listeners) {
            const table = listener.filter?.table || '';
            let socketEvent: string | null = null;

            if (table === 'conversations') socketEvent = 'conversation:updated';
            else if (table === 'messages') socketEvent = 'message:new';
            else if (table === 'notifications') socketEvent = 'notification:new';
            else if (table === 'kanban_cards') socketEvent = 'kanban:updated';
            else if (table === 'contact_tags') socketEvent = 'contact_tags:updated';

            if (!socketEvent) continue;

            const storedCallback = listener.callback;
            const handler = (data: unknown) => {
              storedCallback({ eventType: 'UPDATE', new: data, old: {} });
            };

            this._socketHandlers.push({ event: socketEvent, handler });
            s.on(socketEvent, handler);
          }
        }

        if (cb) {
          if (s.connected) cb('SUBSCRIBED');
          else s.once('connect', () => cb('SUBSCRIBED'));
        }
      } catch {
        if (cb) setTimeout(() => cb('SUBSCRIBED'), 100);
      }
    }).catch(() => {
      if (cb) setTimeout(() => cb('SUBSCRIBED'), 100);
    });
    return this;
  }

  unsubscribe() {
    import('./socket').then(({ getSocket }) => {
      try {
        const s = getSocket();
        if (this._isTypingChannel && this._conversationId) {
          s.emit('leave:conversation', this._conversationId);
        }
        for (const { event, handler } of this._socketHandlers) {
          s.off(event, handler);
        }
      } catch { /* ignore */ }
    }).catch(() => { /* ignore */ });
    this._socketHandlers = [];
    this._listeners = [];
    this._presenceListeners = [];
    this._typingState.clear();
  }

  async track(payload: Record<string, unknown>) {
    if (!this._isTypingChannel || !this._conversationId) return 'ok';
    try {
      const { getSocket } = await import('./socket');
      const s = getSocket();
      if (payload.typing) {
        s.emit('typing:start', { conversationId: this._conversationId, userName: payload.user_name });
      } else {
        s.emit('typing:stop', { conversationId: this._conversationId });
      }
    } catch { /* ignore */ }
    return 'ok';
  }

  presenceState<T = unknown>(): Record<string, T[]> {
    if (this._isTypingChannel) {
      const state: Record<string, unknown[]> = {};
      for (const [userId, data] of this._typingState.entries()) {
        state[userId] = [{ ...data, typing: true }];
      }
      return state as Record<string, T[]>;
    }
    return {};
  }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
const authShim = {
  async signInWithPassword({ email, password }: { email: string; password: string }) {
    try {
      const res = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, error: { message: err.error || 'Credenciais inválidas' } };
      }
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
        credentials: 'include',
        body: JSON.stringify({ email, password, name: options?.data?.name || options?.data?.full_name || email }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { data: null, error: { message: err.error || 'Erro ao criar conta' } };
      }
      const data = await res.json();
      return { data: { user: { id: data.user?.id, email } }, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  },

  async signOut() {
    await fetch(`${BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    return { error: null };
  },

  async getSession() {
    try {
      const me = await apiFetch('GET', '/auth/me') as Record<string, unknown>;
      return { data: { session: { user: { id: me.id, email: me.email, user_metadata: { name: me.name } } } }, error: null };
    } catch {
      return { data: { session: null }, error: null };
    }
  },

  async getUser() {
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
    apiFetch('GET', '/auth/me').then(me => {
      callback('SIGNED_IN', { user: { id: (me as Record<string, unknown>)?.id, email: (me as Record<string, unknown>)?.email } });
    }).catch(() => callback('SIGNED_OUT', null));
    return { data: { subscription: { unsubscribe: () => {} } } };
  },
};

// ── Functions ─────────────────────────────────────────────────────────────────
const FUNCTION_MAP: Record<string, string> = {
  'manage-users': '/manage-users',
  'ai-agent': '/ai-agent',
  'evolution-api': '/evolution-proxy',
};

const functionsShim = {
  async invoke(fnName: string, options?: { body?: unknown; method?: string; headers?: Record<string, string> }) {
    const endpoint = FUNCTION_MAP[fnName];
    if (!endpoint) return { data: null, error: null };
    try {
      const method = options?.method || 'POST';
      const data = await apiFetch(method as 'GET' | 'POST', endpoint, options?.body);
      return { data, error: null };
    } catch (err) {
      return { data: null, error: { message: (err as Error).message } };
    }
  },
};

// ── Main export ───────────────────────────────────────────────────────────────
export const db = {
  from: (table: string) => new QueryBuilder(table),
  auth: authShim,
  storage: { from: (bucket: string) => new StorageBucketProxy(bucket) },
  functions: functionsShim,
  channel: (name: string) => new ChannelProxy(name),
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

export default db;
