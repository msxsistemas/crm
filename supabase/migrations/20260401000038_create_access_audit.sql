CREATE TABLE IF NOT EXISTS access_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('view_contact','edit_contact','export_contacts','delete_contact','view_conversation','export_conversation','send_campaign','view_report','login','logout','api_access')),
  resource_type TEXT,
  resource_id TEXT,
  resource_name TEXT,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE access_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view audit" ON access_audit FOR SELECT USING (
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "System can insert audit" ON access_audit FOR INSERT WITH CHECK (true);
CREATE INDEX idx_access_audit_created ON access_audit(created_at DESC);
CREATE INDEX idx_access_audit_user ON access_audit(user_id);
