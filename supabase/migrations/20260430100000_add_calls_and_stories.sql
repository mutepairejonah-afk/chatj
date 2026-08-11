-- ─── Call history ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.call_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_clerk_id  TEXT NOT NULL,
  callee_clerk_id  TEXT NOT NULL,
  kind             TEXT NOT NULL CHECK (kind IN ('audio','video')),
  status           TEXT NOT NULL CHECK (status IN ('answered','missed','rejected','cancelled')),
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON public.call_logs(caller_clerk_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_callee ON public.call_logs(callee_clerk_id, started_at DESC);
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.call_logs;
CREATE POLICY "service role full access" ON public.call_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── 24-hour stories ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stories (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id    TEXT NOT NULL,
  text             TEXT,
  image_url        TEXT,
  background_color TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours')
);
CREATE INDEX IF NOT EXISTS idx_stories_user_created ON public.stories(clerk_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON public.stories(expires_at);
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.stories;
CREATE POLICY "service role full access" ON public.stories FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Story view tracking (one row per viewer per story)
CREATE TABLE IF NOT EXISTS public.story_views (
  story_id      UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, clerk_user_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.story_views;
CREATE POLICY "service role full access" ON public.story_views FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Stories storage bucket ──────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('story-media', 'story-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read story-media" ON storage.objects;
CREATE POLICY "Public read story-media" ON storage.objects FOR SELECT
USING (bucket_id = 'story-media');

DROP POLICY IF EXISTS "Service role write story-media" ON storage.objects;
CREATE POLICY "Service role write story-media" ON storage.objects FOR INSERT TO service_role
WITH CHECK (bucket_id = 'story-media');

DROP POLICY IF EXISTS "Service role delete story-media" ON storage.objects;
CREATE POLICY "Service role delete story-media" ON storage.objects FOR DELETE TO service_role
USING (bucket_id = 'story-media');
