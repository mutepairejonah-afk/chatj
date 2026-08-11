INSERT INTO storage.buckets (id, name, public)
VALUES ('moment-images', 'moment-images', true);

CREATE POLICY "Public read access for moment images"
ON storage.objects FOR SELECT
USING (bucket_id = 'moment-images');

CREATE POLICY "Service role can upload moment images"
ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'moment-images');

CREATE POLICY "Service role can delete moment images"
ON storage.objects FOR DELETE TO service_role
USING (bucket_id = 'moment-images');