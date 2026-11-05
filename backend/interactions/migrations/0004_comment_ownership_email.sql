ALTER TABLE comments ADD COLUMN deleted_at INTEGER;
ALTER TABLE comments ADD COLUMN reply_hash TEXT NOT NULL DEFAULT '';
CREATE INDEX comments_owner ON comments(actor,created_at,id);
CREATE TABLE comment_subscriptions (
  comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  expires_at INTEGER NOT NULL,
  notified_hash TEXT NOT NULL DEFAULT ''
);
CREATE INDEX subscription_email ON comment_subscriptions(email,verified_at);
CREATE TABLE comment_mail_jobs (
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('verify','reply')),
  email TEXT NOT NULL,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  provider_id TEXT
);
CREATE INDEX comment_mail_pending ON comment_mail_jobs(state,created_at);
