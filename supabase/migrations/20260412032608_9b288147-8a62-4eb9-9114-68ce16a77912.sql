
-- Profiles table (linked to Clerk user IDs)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  status_message TEXT DEFAULT 'Hey there! I''m using ChatApp',
  is_online BOOLEAN DEFAULT false,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contacts table
CREATE TABLE public.contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_clerk_id TEXT NOT NULL,
  contact_clerk_id TEXT NOT NULL,
  nickname TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_clerk_id, contact_clerk_id)
);

-- Conversations table
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct' CHECK (type IN ('direct', 'group')),
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Conversation members
CREATE TABLE public.conversation_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  is_pinned BOOLEAN DEFAULT false,
  unread_count INTEGER DEFAULT 0,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(conversation_id, clerk_user_id)
);

-- Messages table
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_clerk_id TEXT NOT NULL,
  text TEXT,
  image_url TEXT,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Message reactions
CREATE TABLE public.message_reactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(message_id, clerk_user_id, emoji)
);

-- Moments (social feed posts)
CREATE TABLE public.moments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Moment likes
CREATE TABLE public.moment_likes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(moment_id, clerk_user_id)
);

-- Moment comments
CREATE TABLE public.moment_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  moment_id UUID NOT NULL REFERENCES public.moments(id) ON DELETE CASCADE,
  clerk_user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_contacts_user ON public.contacts(user_clerk_id);
CREATE INDEX idx_contacts_contact ON public.contacts(contact_clerk_id);
CREATE INDEX idx_conv_members_user ON public.conversation_members(clerk_user_id);
CREATE INDEX idx_conv_members_conv ON public.conversation_members(conversation_id);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_moments_user ON public.moments(clerk_user_id);
CREATE INDEX idx_moments_created ON public.moments(created_at DESC);
CREATE INDEX idx_moment_likes_moment ON public.moment_likes(moment_id);
CREATE INDEX idx_moment_comments_moment ON public.moment_comments(moment_id);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_moments_updated_at BEFORE UPDATE ON public.moments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moment_comments ENABLE ROW LEVEL SECURITY;

-- Since we use Clerk (not Supabase Auth), server functions use service role key
-- RLS policies use service_role which bypasses RLS
-- All data access goes through authenticated server functions

-- Allow service role full access (server functions use supabaseAdmin)
-- Public read for profiles
CREATE POLICY "Anyone can view profiles" ON public.profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access profiles" ON public.profiles FOR ALL TO service_role USING (true);

CREATE POLICY "Service role full access contacts" ON public.contacts FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access conversations" ON public.conversations FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access conv_members" ON public.conversation_members FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access messages" ON public.messages FOR ALL TO service_role USING (true);
CREATE POLICY "Service role full access reactions" ON public.message_reactions FOR ALL TO service_role USING (true);

CREATE POLICY "Anyone can view moments" ON public.moments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access moments" ON public.moments FOR ALL TO service_role USING (true);

CREATE POLICY "Anyone can view moment_likes" ON public.moment_likes FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access moment_likes" ON public.moment_likes FOR ALL TO service_role USING (true);

CREATE POLICY "Anyone can view moment_comments" ON public.moment_comments FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Service role full access moment_comments" ON public.moment_comments FOR ALL TO service_role USING (true);
