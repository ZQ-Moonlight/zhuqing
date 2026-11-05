-- Apply once after 0001. Existing counts and visitor records are preserved.
ALTER TABLE pages ADD COLUMN likes_adjustment INTEGER NOT NULL DEFAULT 0;
ALTER TABLE view_keys ADD COLUMN recorded_day TEXT;
CREATE TABLE daily_views (
  page TEXT NOT NULL REFERENCES pages(path),
  day TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(page,day)
);
CREATE TABLE analytics_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
INSERT INTO analytics_meta VALUES('views_started',strftime('%Y-%m-%dT%H:%M:%SZ','now'));
CREATE TRIGGER record_daily_views AFTER INSERT ON view_keys
WHEN NEW.recorded_day IS NOT NULL
BEGIN
  INSERT INTO daily_views(page,day,views) VALUES(NEW.page,NEW.recorded_day,1)
  ON CONFLICT(page,day) DO UPDATE SET views=views+1;
END;
CREATE INDEX likes_actor ON likes(actor,page);
CREATE INDEX likes_network ON likes(network,page);
