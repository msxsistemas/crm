-- Add error column to schedules for tracking failed sends
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS error TEXT;
