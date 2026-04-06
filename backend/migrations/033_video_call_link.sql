-- Migration 033: Video call link on conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS video_call_link TEXT;
