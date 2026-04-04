-- MSX CRM — Schema Completo
-- Execute: psql -U msxcrm -d msxcrm -f migrations/001_initial.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── Profiles (users) ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','agent','supervisor')),
  avatar_url TEXT,
  permissions JSONB DEFAULT '{}',
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  last_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Settings ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  company_name TEXT DEFAULT 'MSX CRM',
  evolution_url TEXT,
  evolution_key TEXT,
  openai_key TEXT,
  smtp_host TEXT,
  smtp_port INTEGER,
  smtp_user TEXT,
  smtp_pass TEXT,
  smtp_from TEXT,
  auto_csat_enabled BOOLEAN DEFAULT FALSE,
  csat_message TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO settings (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── Evolution connections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS evolution_connections (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  evolution_url TEXT NOT NULL,
  evolution_key TEXT NOT NULL,
  instance_name TEXT NOT NULL,
  status TEXT DEFAULT 'disconnected',
  qr_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Tags ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Categories ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Contacts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  birthday DATE,
  custom_fields JSONB DEFAULT '{}',
  lead_score INTEGER DEFAULT 0,
  lead_score_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts USING gin(name gin_trgm_ops);

-- ── Conversations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  connection_name TEXT,
  assigned_to UUID REFERENCES profiles(id) ON DELETE SET NULL,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open','in_progress','closed')),
  unread_count INTEGER DEFAULT 0,
  starred BOOLEAN DEFAULT FALSE,
  sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative','urgent')),
  label_ids UUID[] DEFAULT '{}',
  awaiting_csat BOOLEAN DEFAULT FALSE,
  is_merged BOOLEAN DEFAULT FALSE,
  merged_into UUID REFERENCES conversations(id) ON DELETE SET NULL,
  last_message_at TIMESTAMPTZ,
  sla_rule_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_assigned ON conversations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_conversations_last_msg ON conversations(last_message_at DESC);

-- ── Messages ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  type TEXT DEFAULT 'text',
  media_url TEXT,
  quoted_message_id UUID,
  external_id TEXT UNIQUE,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

-- ── Message reactions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS message_reactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(message_id, user_id, emoji)
);

-- ── Conversation notes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_notes (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  author_name TEXT,
  is_internal BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Conversation labels ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_labels (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO conversation_labels (name, color) VALUES
  ('Suporte','#3b82f6'),('Venda','#22c55e'),('Reclamação','#ef4444'),
  ('Financeiro','#f59e0b'),('Urgente','#dc2626'),('Dúvida','#8b5cf6')
ON CONFLICT DO NOTHING;

-- ── Quick replies ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Schedules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  message TEXT NOT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  connection_name TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','cancelled')),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  type TEXT DEFAULT 'info',
  reference_id UUID,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- ── Campaigns ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  connection_name TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','running','paused','completed','failed')),
  total_contacts INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_contacts (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

-- ── Opportunities ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS opportunities (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  value NUMERIC DEFAULT 0,
  stage TEXT DEFAULT 'lead',
  probability INTEGER DEFAULT 0,
  description TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Products ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price NUMERIC DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Chatbot rules ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chatbot_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  trigger TEXT,
  message TEXT,
  flow_data JSONB,
  connection_name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  trigger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatbot_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES chatbot_rules(id) ON DELETE CASCADE,
  current_node_id TEXT,
  variables JSONB DEFAULT '{}',
  waiting_for_input BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Queues ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS queues (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS queue_agents (
  queue_id UUID REFERENCES queues(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (queue_id, agent_id)
);

-- ── Webhooks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS webhooks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  events TEXT[] DEFAULT '{}',
  secret TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS webhook_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  webhook_id UUID REFERENCES webhooks(id) ON DELETE SET NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  event_type TEXT,
  url TEXT,
  status_code INTEGER,
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── SLA rules ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sla_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  priority TEXT DEFAULT 'normal',
  first_response_minutes INTEGER DEFAULT 60,
  resolution_minutes INTEGER DEFAULT 480,
  warning_threshold INTEGER DEFAULT 80,
  applies_to_tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Reviews ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  type TEXT DEFAULT 'csat',
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Activity log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  resource_name TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- ── Follow-up reminders ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS followup_reminders (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  reminder_at TIMESTAMPTZ NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed','completed')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── API tokens ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{"read","write"}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── HSM Templates ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hsm_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  language TEXT DEFAULT 'pt_BR',
  status TEXT DEFAULT 'pending',
  header_type TEXT,
  header_content TEXT,
  body TEXT NOT NULL,
  footer TEXT,
  buttons JSONB DEFAULT '[]',
  variables TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Segments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS segments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  conditions JSONB DEFAULT '[]',
  operator TEXT DEFAULT 'AND',
  contact_count INTEGER DEFAULT 0,
  last_calculated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Contact groups ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_groups (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#3b82f6',
  contact_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS contact_group_members (
  group_id UUID REFERENCES contact_groups(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (group_id, contact_id)
);

-- ── Blacklist ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS blacklist (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  reason TEXT,
  blocked_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  blocked_by_name TEXT,
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Agent schedules ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_schedules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  monday_start TEXT, monday_end TEXT, monday_active BOOLEAN DEFAULT TRUE,
  tuesday_start TEXT, tuesday_end TEXT, tuesday_active BOOLEAN DEFAULT TRUE,
  wednesday_start TEXT, wednesday_end TEXT, wednesday_active BOOLEAN DEFAULT TRUE,
  thursday_start TEXT, thursday_end TEXT, thursday_active BOOLEAN DEFAULT TRUE,
  friday_start TEXT, friday_end TEXT, friday_active BOOLEAN DEFAULT TRUE,
  saturday_start TEXT, saturday_end TEXT, saturday_active BOOLEAN DEFAULT FALSE,
  sunday_start TEXT, sunday_end TEXT, sunday_active BOOLEAN DEFAULT FALSE,
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Proposals ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proposals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'draft',
  items JSONB DEFAULT '[]',
  subtotal NUMERIC DEFAULT 0,
  discount_percent NUMERIC DEFAULT 0,
  total NUMERIC DEFAULT 0,
  valid_until DATE,
  notes TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Sales goals ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_goals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  agent_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  period_month INTEGER NOT NULL,
  period_year INTEGER NOT NULL,
  goal_type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  current_value NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, period_month, period_year, goal_type)
);

-- ── Conversion transfers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversation_transfers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  from_agent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_agent_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  from_agent_name TEXT,
  to_agent_name TEXT,
  note TEXT,
  transferred_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto distribution ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auto_distribution_config (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  is_active BOOLEAN DEFAULT FALSE,
  mode TEXT DEFAULT 'round_robin',
  max_conversations_per_agent INTEGER DEFAULT 10,
  respect_working_hours BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO auto_distribution_config (id) VALUES (uuid_generate_v4()) ON CONFLICT DO NOTHING;

-- ── Lead scoring rules ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lead_scoring_rules (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value TEXT,
  points INTEGER DEFAULT 10,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── WhatsApp statuses ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS whatsapp_statuses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  instance_name TEXT NOT NULL,
  type TEXT NOT NULL,
  content TEXT,
  caption TEXT,
  background_color TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Contact forms ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contact_forms (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB DEFAULT '["name","phone","email"]',
  welcome_message TEXT,
  success_message TEXT,
  assign_tag TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  submission_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Attendance flow templates ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance_flow_templates (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  steps JSONB DEFAULT '[]',
  created_by UUID REFERENCES profiles(id),
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

RAISE NOTICE 'Schema criado com sucesso!';
