-- Add a request/accept friend flow to the contacts table
-- status semantics:
--   'accepted'         — both users see each other in their contacts list
--   'pending_outgoing' — I've sent a request, waiting for them to accept
--   'pending_incoming' — They sent me a request, I need to accept/reject
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('accepted', 'pending_outgoing', 'pending_incoming'));

CREATE INDEX IF NOT EXISTS idx_contacts_user_status
  ON public.contacts (user_clerk_id, status);

-- Backfill: any existing rows are treated as already-accepted contacts
UPDATE public.contacts SET status = 'accepted' WHERE status IS NULL;
