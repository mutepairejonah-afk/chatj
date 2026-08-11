-- ─────────────────────────────────────────────────────────────────────────────
-- FULL GROUP CHAT FEATURE EXPANSION
-- Adds: group profile (DP/description/creator), admin roles & permissions,
-- invite links, mute, pin, star, block, report, polls, disappearing messages,
-- documents, location sharing, contact sharing.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Conversations: group profile + invite + permissions ─────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS created_by        TEXT,
  ADD COLUMN IF NOT EXISTS invite_code       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS only_admins_send  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS only_admins_edit  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disappearing_seconds INTEGER;  -- NULL = off

CREATE INDEX IF NOT EXISTS idx_conversations_invite_code
  ON public.conversations(invite_code) WHERE invite_code IS NOT NULL;

-- ── Conversation members: roles + per-user mute ─────────────────────────────
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin','member')),
  ADD COLUMN IF NOT EXISTS mute_until TIMESTAMPTZ;  -- NULL = not muted

-- Backfill: any existing conversation_member with no admin yet gets bumped to
-- admin if they're the creator, else stays member. Conservative: pick the
-- earliest joiner per group as admin.
WITH first_members AS (
  SELECT DISTINCT ON (conversation_id) id, conversation_id
  FROM public.conversation_members
  ORDER BY conversation_id, joined_at ASC
)
UPDATE public.conversation_members cm
SET role = 'admin'
FROM first_members fm
WHERE cm.id = fm.id
  AND EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = cm.conversation_id AND c.type = 'group');

-- ── Messages: documents, location, contact, expiry, pin, type ───────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS file_url        TEXT,
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS file_size       BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_label  TEXT,
  ADD COLUMN IF NOT EXISTS contact_payload JSONB,           -- {name, phone, handle, avatar_url}
  ADD COLUMN IF NOT EXISTS poll_id         UUID,            -- references polls(id)
  ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ,     -- disappearing messages
  ADD COLUMN IF NOT EXISTS pinned          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by       TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON public.messages(conversation_id, pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_messages_expires
  ON public.messages(expires_at) WHERE expires_at IS NOT NULL;

-- ── Starred messages (per user) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.starred_messages (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  clerk_user_id   TEXT NOT NULL,
  starred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, clerk_user_id)
);
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access starred_messages"
  ON public.starred_messages FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_starred_messages_user ON public.starred_messages(clerk_user_id);

-- ── Blocked users ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.blocked_users (
  id                  UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_clerk_id    TEXT NOT NULL,
  blocked_clerk_id    TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(blocker_clerk_id, blocked_clerk_id)
);
ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access blocked_users"
  ON public.blocked_users FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_clerk_id);

-- ── Reports (group or user) ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_clerk_id    TEXT NOT NULL,
  target_type          TEXT NOT NULL CHECK (target_type IN ('user','group','message')),
  target_id            TEXT NOT NULL,                 -- clerk_user_id or conv id or msg id
  reason               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access reports"
  ON public.reports FOR ALL TO service_role USING (true);

-- ── Polls + options + votes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.polls (
  id                 UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id    UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  created_by         TEXT NOT NULL,
  question           TEXT NOT NULL,
  allow_multiple     BOOLEAN NOT NULL DEFAULT false,
  closed             BOOLEAN NOT NULL DEFAULT false,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.polls ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access polls"
  ON public.polls FOR ALL TO service_role USING (true);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id     UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access poll_options"
  ON public.poll_options FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON public.poll_options(poll_id);

CREATE TABLE IF NOT EXISTS public.poll_votes (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  option_id       UUID NOT NULL REFERENCES public.poll_options(id) ON DELETE CASCADE,
  poll_id         UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  clerk_user_id   TEXT NOT NULL,
  voted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(option_id, clerk_user_id)
);
ALTER TABLE public.poll_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access poll_votes"
  ON public.poll_votes FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);
