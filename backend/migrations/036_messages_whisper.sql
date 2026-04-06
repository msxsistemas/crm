-- Migration 036: Add is_whisper column to messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_whisper BOOLEAN DEFAULT false;

-- Index for quick filtering
CREATE INDEX IF NOT EXISTS idx_messages_is_whisper ON messages (is_whisper) WHERE is_whisper = true;
