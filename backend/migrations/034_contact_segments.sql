-- Migration 034: Dynamic contact segments for advanced segmentation
CREATE TABLE IF NOT EXISTS dynamic_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  filters JSONB NOT NULL DEFAULT '[]',
  contact_count INT DEFAULT 0,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dynamic_segments_created_by ON dynamic_segments(created_by);
