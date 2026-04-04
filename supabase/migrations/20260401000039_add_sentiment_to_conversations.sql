ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sentiment TEXT CHECK (sentiment IN ('positive','neutral','negative','urgent'));
