// Every public count, thread and reply uses the same visibility rules.
// Bind the current registry paths as the first parameter.
export const visibleComments = `WITH visible AS (
  SELECT c.* FROM comments c
  JOIN pages p ON p.path=c.page
  LEFT JOIN comments parent ON parent.id=c.parent_id
  WHERE c.status='approved' AND p.comments_enabled=1
    AND (c.deleted_at IS NULL OR (c.parent_id IS NULL AND EXISTS(
      SELECT 1 FROM comments child WHERE child.parent_id=c.id AND child.status='approved' AND child.deleted_at IS NULL
    )))
    AND c.page IN (SELECT value FROM json_each(?))
    AND (c.parent_id IS NULL OR (
      parent.status='approved' AND parent.parent_id IS NULL AND parent.page=c.page
    ))
)`;

export const publicCommentFields = `c.id,c.page,
  CASE WHEN c.deleted_at IS NULL THEN c.nickname ELSE '' END AS nickname,
  CASE WHEN c.deleted_at IS NULL THEN c.body ELSE '' END AS body,
  CASE WHEN c.deleted_at IS NULL THEN c.reply ELSE '' END AS reply,c.created_at,
  c.parent_id,c.reply_to_id,c.deleted_at,
  (SELECT nickname FROM visible target WHERE target.id=c.reply_to_id AND target.deleted_at IS NULL) AS replyToName,
  (SELECT COUNT(*) FROM visible child WHERE child.parent_id=c.id AND child.deleted_at IS NULL) AS replyCount`;
