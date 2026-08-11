-- ─── Premium subscription tier ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'premium', 'pro')),
  ADD COLUMN IF NOT EXISTS hide_read_receipts  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio_links           JSONB   NOT NULL DEFAULT '[]'::jsonb;

-- ─── Story highlights (permanent pinned story reels) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.story_highlights (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT        NOT NULL,
  title         TEXT        NOT NULL DEFAULT 'Highlight',
  cover_url     TEXT,
  story_ids     UUID[]      NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.story_highlights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.story_highlights;
CREATE POLICY "service role full access" ON public.story_highlights
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Scheduled messages ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id   TEXT        NOT NULL,
  conversation_id UUID        NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  text            TEXT,
  image_url       TEXT,
  scheduled_for   TIMESTAMPTZ NOT NULL,
  sent            BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.scheduled_messages;
CREATE POLICY "service role full access" ON public.scheduled_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Per-conversation wallpapers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.conversation_wallpapers (
  clerk_user_id   TEXT NOT NULL,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  wallpaper_url   TEXT NOT NULL,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clerk_user_id, conversation_id)
);
ALTER TABLE public.conversation_wallpapers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.conversation_wallpapers;
CREATE POLICY "service role full access" ON public.conversation_wallpapers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
