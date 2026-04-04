-- permissions already exists as JSONB in profiles (from earlier migration)
-- Just ensure the column exists:
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
