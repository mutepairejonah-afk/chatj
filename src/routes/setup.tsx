import { createFileRoute } from "@tanstack/react-router";


import { useState } from "react";
import { Copy, Check, ExternalLink } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────
// Each block below is copied verbatim from supabase/migrations/*.sql.
// They're all written with IF NOT EXISTS / ON CONFLICT DO NOTHING, so it's
// always safe to re-run any (or all) of them, even if partially applied.
// ─────────────────────────────────────────────────────────────────────────

const USERNAME_SQL = `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username_lower
  ON public.profiles (LOWER(username))
  WHERE username IS NOT NULL;`;

const FRIEND_REQUESTS_SQL = `-- Add a request/accept friend flow to the contacts table
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'accepted'
  CHECK (status IN ('accepted', 'pending_outgoing', 'pending_incoming'));

CREATE INDEX IF NOT EXISTS idx_contacts_user_status
  ON public.contacts (user_clerk_id, status);

UPDATE public.contacts SET status = 'accepted' WHERE status IS NULL;`;

const MESSAGE_EDIT_DELETE_REPLY_SQL = `ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_edited  boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz,
  ADD COLUMN IF NOT EXISTS is_deleted boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS reply_to_message_id UUID REFERENCES messages(id) ON DELETE SET NULL;`;

const CALLS_STORIES_SQL = `-- ─── Call history ────────────────────────────────────────────────────
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

CREATE TABLE IF NOT EXISTS public.story_views (
  story_id      UUID NOT NULL REFERENCES public.stories(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  viewed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (story_id, clerk_user_id)
);
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service role full access" ON public.story_views;
CREATE POLICY "service role full access" ON public.story_views FOR ALL TO service_role USING (true) WITH CHECK (true);

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
USING (bucket_id = 'story-media');`;

const GROUP_FEATURES_SQL = `-- ── Conversations: group profile + invite + permissions ─────────────────────
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS description       TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url        TEXT,
  ADD COLUMN IF NOT EXISTS created_by        TEXT,
  ADD COLUMN IF NOT EXISTS invite_code       TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS only_admins_send  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS only_admins_edit  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disappearing_seconds INTEGER;

CREATE INDEX IF NOT EXISTS idx_conversations_invite_code
  ON public.conversations(invite_code) WHERE invite_code IS NOT NULL;

-- ── Conversation members: roles + per-user mute ─────────────────────────────
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'member'
    CHECK (role IN ('admin','member')),
  ADD COLUMN IF NOT EXISTS mute_until TIMESTAMPTZ;

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

-- ── Messages: documents, location, contact, expiry, pin ──────────────────────
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS file_url        TEXT,
  ADD COLUMN IF NOT EXISTS file_name       TEXT,
  ADD COLUMN IF NOT EXISTS file_size       BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type       TEXT,
  ADD COLUMN IF NOT EXISTS latitude        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_label  TEXT,
  ADD COLUMN IF NOT EXISTS contact_payload JSONB,
  ADD COLUMN IF NOT EXISTS poll_id         UUID,
  ADD COLUMN IF NOT EXISTS expires_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pinned_by       TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_pinned
  ON public.messages(conversation_id, pinned) WHERE pinned = true;
CREATE INDEX IF NOT EXISTS idx_messages_expires
  ON public.messages(expires_at) WHERE expires_at IS NOT NULL;

-- ── Starred messages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.starred_messages (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id      UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  clerk_user_id   TEXT NOT NULL,
  starred_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, clerk_user_id)
);
ALTER TABLE public.starred_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access starred_messages" ON public.starred_messages;
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
DROP POLICY IF EXISTS "Service role full access blocked_users" ON public.blocked_users;
CREATE POLICY "Service role full access blocked_users"
  ON public.blocked_users FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_blocked_users_blocker ON public.blocked_users(blocker_clerk_id);

-- ── Reports ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.reports (
  id                   UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_clerk_id    TEXT NOT NULL,
  target_type          TEXT NOT NULL CHECK (target_type IN ('user','group','message')),
  target_id            TEXT NOT NULL,
  reason               TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access reports" ON public.reports;
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
DROP POLICY IF EXISTS "Service role full access polls" ON public.polls;
CREATE POLICY "Service role full access polls"
  ON public.polls FOR ALL TO service_role USING (true);

CREATE TABLE IF NOT EXISTS public.poll_options (
  id          UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  poll_id     UUID NOT NULL REFERENCES public.polls(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.poll_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role full access poll_options" ON public.poll_options;
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
DROP POLICY IF EXISTS "Service role full access poll_votes" ON public.poll_votes;
CREATE POLICY "Service role full access poll_votes"
  ON public.poll_votes FOR ALL TO service_role USING (true);
CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON public.poll_votes(poll_id);`;

const PREMIUM_SQL = `-- ─── Premium subscription tier ─────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_tier IN ('free', 'premium', 'pro')),
  ADD COLUMN IF NOT EXISTS hide_read_receipts  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verified            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bio_links           JSONB   NOT NULL DEFAULT '[]'::jsonb;

-- ─── Story highlights ─────────────────────────────────────────────────────
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

-- ─── Scheduled messages ───────────────────────────────────────────────────
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

-- ─── Per-conversation wallpapers ────────────────────────────────────────────
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
  FOR ALL TO service_role USING (true) WITH CHECK (true);`;

const ECOCASH_SQL = `-- 1. Admin access control
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 2. Payments / orders table
CREATE TABLE IF NOT EXISTS public.payments (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          TEXT          NOT NULL,
  user_display_name TEXT,
  amount           DECIMAL(10,2) NOT NULL,
  currency         TEXT          NOT NULL DEFAULT 'USD'
                     CHECK (currency IN ('USD', 'ZiG')),
  transaction_id   TEXT          NOT NULL,
  status           TEXT          NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  screenshot_url   TEXT,
  approved_by      TEXT,
  processed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  dispute_note     TEXT,
  created_at       TIMESTAMPTZ   DEFAULT NOW() NOT NULL,
  CONSTRAINT payments_transaction_id_unique UNIQUE (transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_payments_user_id  ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_status   ON public.payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_txid     ON public.payments(transaction_id);

-- 3. EcoCash admin settings
CREATE TABLE IF NOT EXISTS public.ecocash_settings (
  id               INTEGER       PRIMARY KEY DEFAULT 1,
  usd_to_zig_rate  DECIMAL(10,4) NOT NULL DEFAULT 13.5000,
  ecocash_number   TEXT          NOT NULL DEFAULT '0788800342',
  updated_at       TIMESTAMPTZ   DEFAULT NOW()
);
INSERT INTO public.ecocash_settings (id, usd_to_zig_rate, ecocash_number)
VALUES (1, 13.5, '0788800342')
ON CONFLICT (id) DO NOTHING;

-- 4. Storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO NOTHING;

-- To grant yourself admin access, run separately:
--   UPDATE public.profiles SET is_admin = true WHERE clerk_user_id = '<your-clerk-user-id>';`;

const PUSH_TOKEN_SQL = `ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT;`;

const ALL_SQL = [
  USERNAME_SQL,
  FRIEND_REQUESTS_SQL,
  MESSAGE_EDIT_DELETE_REPLY_SQL,
  CALLS_STORIES_SQL,
  GROUP_FEATURES_SQL,
  PREMIUM_SQL,
  ECOCASH_SQL,
  PUSH_TOKEN_SQL,
].join("\n\n");

// A missing-column error is 42703, a missing-table error is 42P01.
const isMissing = (error: any) => !!error && (error.code === "42703" || error.code === "42P01");

const checkSetupFn = async () => ({
  usernameApplied: false,
  friendRequestsApplied: false,
  messageEditDeleteReplyApplied: false,
  callsApplied: false,
  storiesApplied: false,
  groupFeaturesApplied: false,
  premiumApplied: false,
  ecocashApplied: false,
  pushTokenApplied: false,
});

export const Route = createFileRoute("/setup")({
  loader: () => checkSetupFn(),
  component: SetupPage,
});

function SqlBlock({
  title, description, sql, applied, label,
}: {
  title: string;
  description: string;
  sql: string;
  applied: boolean;
  label: string;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`rounded-2xl p-6 w-full max-w-md ${applied ? "bg-online/10 border border-online/20" : "bg-card"}`}>
      <h2 className="text-lg font-bold text-foreground mb-1">
        {applied ? `✓ ${label} Ready!` : title}
      </h2>
      {applied ? (
        <p className="text-sm text-muted-foreground">{label} is enabled and ready to use.</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-4">{description}</p>
          <div className="relative mb-3">
            <pre className="text-left text-[11px] bg-secondary rounded-xl p-3 overflow-auto whitespace-pre text-foreground pr-10 max-h-64">
              {sql}
            </pre>
            <button
              onClick={copy}
              className="absolute top-2 right-2 rounded-lg bg-card p-1.5 text-muted-foreground"
            >
              {copied ? <Check size={14} className="text-online" /> : <Copy size={14} />}
            </button>
          </div>
          <a
            href="https://supabase.com/dashboard/project/_/sql/new"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground"
          >
            <ExternalLink size={15} />
            Open Supabase SQL Editor
          </a>
        </>
      )}
    </div>
  );
}

function SetupPage() {
  const data = Route.useLoaderData();

  const allApplied =
    data.usernameApplied && data.friendRequestsApplied && data.messageEditDeleteReplyApplied &&
    data.callsApplied && data.storiesApplied && data.groupFeaturesApplied &&
    data.premiumApplied && data.ecocashApplied && data.pushTokenApplied;

  const [copiedAll, setCopiedAll] = useState(false);
  const copyAll = async () => {
    await navigator.clipboard.writeText(ALL_SQL);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div className="flex h-full flex-col items-center gap-4 px-6 py-8 bg-background overflow-y-auto">
      <h1 className="text-2xl font-bold text-foreground">Setup</h1>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        Run any pending SQL in the Supabase SQL Editor, then refresh this page.
        Every block here is safe to re-run — nothing will be duplicated or overwritten.
      </p>

      {!allApplied && (
        <button
          onClick={copyAll}
          className="w-full max-w-md rounded-2xl bg-foreground text-background py-3 text-sm font-semibold flex items-center justify-center gap-2"
        >
          {copiedAll ? <Check size={15} /> : <Copy size={15} />}
          {copiedAll ? "Copied — paste into Supabase SQL Editor" : "Copy ALL pending SQL at once"}
        </button>
      )}

      <SqlBlock
        title="Enable Username Feature"
        description="Adds the @handle column for username search and QR connect."
        sql={USERNAME_SQL}
        applied={data.usernameApplied}
        label="Usernames"
      />

      <SqlBlock
        title="Enable Friend Requests"
        description="Adds request/accept status to contacts so add-friend flows work."
        sql={FRIEND_REQUESTS_SQL}
        applied={data.friendRequestsApplied}
        label="Friend Requests"
      />

      <SqlBlock
        title="Enable Message Edit / Delete / Reply"
        description="Adds is_edited, is_deleted and reply_to_message_id to messages."
        sql={MESSAGE_EDIT_DELETE_REPLY_SQL}
        applied={data.messageEditDeleteReplyApplied}
        label="Message Editing"
      />

      <SqlBlock
        title="Enable Calls & Stories"
        description="Creates the call_logs, stories and story_views tables plus the story-media storage bucket."
        sql={CALLS_STORIES_SQL}
        applied={data.callsApplied && data.storiesApplied}
        label="Calls & Stories"
      />

      <SqlBlock
        title="Enable Full Group Features"
        description="Group profile/invite links/admin roles/mute, plus documents, location & contact sharing, pinning, starring, blocking, reporting, and polls."
        sql={GROUP_FEATURES_SQL}
        applied={data.groupFeaturesApplied}
        label="Group Features"
      />

      <SqlBlock
        title="Enable Premium Features"
        description="Subscription tiers, verified badge, bio links, story highlights, scheduled messages, and per-chat wallpapers."
        sql={PREMIUM_SQL}
        applied={data.premiumApplied}
        label="Premium"
      />

      <SqlBlock
        title="Enable EcoCash Payments & Admin"
        description="Admin flag, payments table, and EcoCash settings needed for the checkout/admin payments flow."
        sql={ECOCASH_SQL}
        applied={data.ecocashApplied}
        label="EcoCash Payments"
      />

      <SqlBlock
        title="Enable Push Notifications"
        description="Adds push_token to profiles so native devices can register for push."
        sql={PUSH_TOKEN_SQL}
        applied={data.pushTokenApplied}
        label="Push Notifications"
      />

      <div className="rounded-2xl bg-card p-4 w-full max-w-md">
        <h2 className="text-sm font-semibold text-foreground mb-1">Current status</h2>
        <ul className="text-xs text-muted-foreground space-y-1">
          <li>{data.usernameApplied ? "✓" : "•"} Usernames / @handles</li>
          <li>{data.friendRequestsApplied ? "✓" : "•"} Friend requests</li>
          <li>{data.messageEditDeleteReplyApplied ? "✓" : "•"} Message edit / delete / reply</li>
          <li>{data.callsApplied ? "✓" : "•"} Call history</li>
          <li>{data.storiesApplied ? "✓" : "•"} 24-hour stories</li>
          <li>{data.groupFeaturesApplied ? "✓" : "•"} Full group features (pin/star/block/report/polls/docs/location)</li>
          <li>{data.premiumApplied ? "✓" : "•"} Premium (tiers/verified/highlights/scheduled/wallpaper)</li>
          <li>{data.ecocashApplied ? "✓" : "•"} EcoCash payments & admin</li>
          <li>{data.pushTokenApplied ? "✓" : "•"} Push notifications</li>
        </ul>
      </div>
    </div>
  );
}
