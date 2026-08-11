ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS is_edited  boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS edited_at  timestamptz;
