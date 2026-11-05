-- Existing comments remain top-level. Reply threads are displayed in two levels.
ALTER TABLE comments ADD COLUMN parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE;
ALTER TABLE comments ADD COLUMN reply_to_id TEXT REFERENCES comments(id) ON DELETE SET NULL;
CREATE INDEX comments_replies ON comments(parent_id,status,created_at,id);
