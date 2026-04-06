-- Migration 039: Pix Charges
CREATE TABLE IF NOT EXISTS pix_charges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  pix_key TEXT,
  qr_code_text TEXT,
  status TEXT DEFAULT 'pending',
  paid_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add pix_key to settings if not exists
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pix_merchant_name TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS pix_merchant_city TEXT;
