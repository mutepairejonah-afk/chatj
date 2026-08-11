
-- Create the chat-media storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-media', 'chat-media', true);

-- Allow public read access to chat media
CREATE POLICY "Public read access for chat media"
ON storage.objects
FOR SELECT
USING (bucket_id = 'chat-media');

-- Allow service role to insert
CREATE POLICY "Service role can upload chat media"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'chat-media');

-- Allow service role to delete
CREATE POLICY "Service role can delete chat media"
ON storage.objects
FOR DELETE
TO service_role
USING (bucket_id = 'chat-media');

-- Add video_url column to messages table
ALTER TABLE public.messages ADD COLUMN video_url text;
