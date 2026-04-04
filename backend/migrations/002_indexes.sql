-- Performance indexes para queries frequentes do CRM

-- Conversations: filtros mais usados
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_assigned_to ON conversations(assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_contact_id ON conversations(contact_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_last_message_at ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_connection_name ON conversations(connection_name);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_status_assigned ON conversations(status, assigned_to);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_conversations_is_merged ON conversations(is_merged) WHERE is_merged = false;

-- Messages: lookup por conversa (mais frequente de todas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at ASC);

-- Contacts: busca por nome/telefone/email
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_name_trgm ON contacts USING gin(name gin_trgm_ops);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_email ON contacts(email);

-- Profiles: login por email
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email ON profiles(email);

-- must_change_password column (adicionada na migração de senha aleatória)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;
