ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES profiles(id);
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE quick_replies ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS template_approval_required BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS login_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  ip_address TEXT,
  user_agent TEXT,
  token_hash TEXT,
  logged_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
