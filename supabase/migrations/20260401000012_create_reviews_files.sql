-- Reviews/NPS table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  nps_score INTEGER CHECK (nps_score >= 0 AND nps_score <= 10),
  comment TEXT,
  sent_at TIMESTAMPTZ DEFAULT now(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users read reviews" ON reviews FOR SELECT TO authenticated USING (true);
CREATE POLICY "Service role manages reviews" ON reviews FOR ALL TO service_role USING (true);

-- File manager storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('file-manager', 'file-manager', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated upload file-manager" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'file-manager');
CREATE POLICY "Authenticated update file-manager" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'file-manager');
CREATE POLICY "Authenticated delete file-manager" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'file-manager');
CREATE POLICY "Public read file-manager" ON storage.objects FOR SELECT TO public USING (bucket_id = 'file-manager');
