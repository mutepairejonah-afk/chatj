ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_deleted  boolean     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz;
