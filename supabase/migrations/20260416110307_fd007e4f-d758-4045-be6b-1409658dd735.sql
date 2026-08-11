CREATE TABLE public.message_read_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id uuid NOT NULL,
  clerk_user_id text NOT NULL,
  read_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (message_id, clerk_user_id)
);

ALTER TABLE public.message_read_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access message_read_receipts"
ON public.message_read_receipts
FOR ALL
TO service_role
USING (true);

CREATE POLICY "Anyone can view message_read_receipts"
ON public.message_read_receipts
FOR SELECT
TO anon, authenticated
USING (true);

-- Enable realtime for read receipts
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_read_receipts;

-- Index for fast lookups
CREATE INDEX idx_message_read_receipts_message_id ON public.message_read_receipts (message_id);
CREATE INDEX idx_message_read_receipts_user ON public.message_read_receipts (clerk_user_id);