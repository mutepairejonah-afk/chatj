-- Add username/handle column to profiles
ALTER TABLE public.profiles
  ADD COLUMN username TEXT UNIQUE;

-- Case-insensitive index for fast handle searches
CREATE UNIQUE INDEX idx_profiles_username_lower ON public.profiles (LOWER(username));

-- Allow searching by username
CREATE INDEX idx_profiles_username ON public.profiles (username);
