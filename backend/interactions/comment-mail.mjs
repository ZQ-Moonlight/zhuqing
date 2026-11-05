import { assert, emailOK, hmac, uuid } from './security.mjs';
import { visibleComments } from './comment-queries.mjs';

const DAY = 86400000;
const SITE = 'https://zhuqing.tech/';
const query = (env, sql, ...values) => env.DB.prepare(sql).bind(...values);

async function linkToken(env, action, commentId, email) {
  const signature = await hmac(env.ABUSE_SECRET, JSON.stringify(['comment-email', action, commentId, email]));
  return `${action}.${commentId}.${signature}`;
}

async function sendJob(env, job, fetcher, now, publicPaths) {
  if (job.state === 'accepted') return 'accepted';
  if (now - job.created_at >= 23 * 3600000) {
    await query(env, "UPDATE comment_mail_jobs SET state='expired' WHERE id=? AND state!='accepted'", job.id).run();
    return 'expired';
  }
  const payload = JSON.parse(job.payload);
  const subscription = job.kind === 'reply'
    ? await query(env, `${visibleComments}
        SELECT s.comment_id FROM comment_subscriptions s JOIN visible c ON c.id=s.comment_id
        JOIN json_each(?) snapshot ON c.id=json_extract(snapshot.value,'$.id')
        WHERE s.email=? AND s.expires_at>? AND s.verified_at IS NOT NULL AND c.deleted_at IS NULL
          AND c.reply!='' AND c.reply_hash=json_extract(snapshot.value,'$.hash') LIMIT 1`,
        publicPaths, JSON.stringify(payload.comments), job.email, now).first()
    : await query(env, `SELECT s.* FROM comment_subscriptions s JOIN comments c ON c.id=s.comment_id
        WHERE s.comment_id=? AND s.email=? AND s.expires_at>? AND c.deleted_at IS NULL`, payload.commentId, job.email, now).first();
  if (!subscription) {
    await query(env, "UPDATE comment_mail_jobs SET state='cancelled' WHERE id=? AND state!='accepted'", job.id).run();
    if (job.kind === 'reply' && job.state === 'pending') {
      await query(env, `UPDATE comment_subscriptions SET notified_hash='' WHERE EXISTS (
        SELECT 1 FROM json_each(?) snapshot WHERE json_extract(snapshot.value,'$.id')=comment_id
          AND json_extract(snapshot.value,'$.hash')=notified_hash)`, JSON.stringify(payload.comments)).run();
    }
    return 'cancelled';
  }
  // Digest links use the retained job, so removing one comment does not invalidate a mailbox-wide unsubscribe.
  const unsubscribe = SITE + '#comment-email=' + await linkToken(env, 'unsubscribe', job.kind === 'reply' ? job.id : payload.commentId, job.email);
  let subject = '你的留言收到了祝庆的回复';
  let body = `祝庆回复了你的留言。\n\n查看回复\n${SITE}#site-interactions\n\n退订\n${unsubscribe}`;
  if (job.kind === 'verify') {
    subject = '请确认个人网站的回复提醒';
    const verify = SITE + '#comment-email=' + await linkToken(env, 'verify', payload.commentId, job.email);
    body = `确认邮箱，接收祝庆对你这条留言的回复提醒。\n\n${verify}\n\n链接 24 小时有效。非本人操作请忽略。\n\n退订\n${unsubscribe}`;
  }
  try {
    assert(env.RESEND_API_KEY && emailOK(env.MAIL_FROM), 503, 'mail_unconfigured');
    const response = await fetcher('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': job.id },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [job.email], subject, text: body }),
      signal: AbortSignal.timeout(10000),
    });
    assert(response.ok, 502, 'mail_failed');
    const result = await response.json();
    assert(typeof result.id === 'string' && result.id, 502, 'mail_unconfirmed');
    await query(env, "UPDATE comment_mail_jobs SET state='accepted',provider_id=? WHERE id=?", result.id, job.id).run();
    return 'accepted';
  } catch {
    await query(env, "UPDATE comment_mail_jobs SET state='unknown' WHERE id=? AND state!='accepted'", job.id).run();
    return 'unknown';
  }
}

export async function subscribeToComment(env, comment, email, network, quota, fetcher, now) {
  if (!email) return 'off';
  try {
    let subscription = await query(env, 'SELECT * FROM comment_subscriptions WHERE comment_id=?', comment.id).first();
    if (!subscription) {
      const trusted = await query(env, `SELECT 1 FROM comment_subscriptions s JOIN comments c ON c.id=s.comment_id
        WHERE s.email=? AND c.actor=? AND s.verified_at IS NOT NULL AND s.expires_at>? LIMIT 1`, email, comment.actor, now).first();
      if (!trusted) {
        await quota(env, 'verification-email:' + await hmac(env.ABUSE_SECRET, email), 2, DAY);
        await quota(env, 'verification-network:' + network, 2, DAY);
        await quota(env, 'global-verification-email', 20, DAY);
      }
      await query(env, `INSERT OR IGNORE INTO comment_subscriptions(comment_id,email,created_at,verified_at,expires_at)
        SELECT ?,?,?,?,? FROM comments WHERE id=? AND deleted_at IS NULL`, comment.id, email, now, trusted ? now : null,
        now + (trusted ? 90 : 1) * DAY, comment.id).run();
      subscription = await query(env, 'SELECT * FROM comment_subscriptions WHERE comment_id=?', comment.id).first();
    }
    if (!subscription) return 'off';
    if (subscription.verified_at) return 'enabled';
    const jobId = 'comment-verify-' + comment.id;
    await query(env, `INSERT OR IGNORE INTO comment_mail_jobs(id,claim,kind,email,payload,created_at) VALUES(?,?,'verify',?,?,?)`,
      jobId, crypto.randomUUID(), email, JSON.stringify({ commentId: comment.id }), subscription.created_at).run();
    const job = await query(env, 'SELECT * FROM comment_mail_jobs WHERE id=?', jobId).first();
    return await sendJob(env, job, fetcher, now) === 'accepted' ? 'verification_sent' : 'unavailable';
  } catch {
    return 'unavailable';
  }
}

export async function confirmCommentEmail(env, token, now) {
  assert(typeof token === 'string' && token.length < 200, 400, 'invalid_token');
  const [action, commentId, signature] = token.split('.');
  const digestLink = action === 'unsubscribe' && /^comment-reply-\d{4}-\d{2}-\d{2}-[a-f0-9]{64}$/.test(commentId);
  assert(['verify', 'unsubscribe'].includes(action) && (uuid(commentId) || digestLink) && /^[a-f0-9]{64}$/.test(signature), 400, 'invalid_token');
  const subscription = digestLink
    ? await query(env, "SELECT email FROM comment_mail_jobs WHERE id=? AND kind='reply' AND created_at>?", commentId, now - 30 * DAY).first()
    : await query(env, 'SELECT * FROM comment_subscriptions WHERE comment_id=?', commentId).first();
  assert(subscription && await linkToken(env, action, commentId, subscription.email) === token, 400, 'invalid_token');
  if (action === 'unsubscribe') {
    await env.DB.batch([
      query(env, 'DELETE FROM comment_subscriptions WHERE email=?', subscription.email),
      query(env, "UPDATE comment_mail_jobs SET state='cancelled' WHERE email=? AND state!='accepted'", subscription.email),
    ]);
    return 'unsubscribed';
  }
  assert(subscription.expires_at > now, 410, 'verification_expired');
  await query(env, 'UPDATE comment_subscriptions SET verified_at=COALESCE(verified_at,?),expires_at=? WHERE comment_id=?', now, now + 90 * DAY, commentId).run();
  return 'subscribed';
}

export async function sendReplyDigests(env, publicPaths, quota, fetcher, now) {
  // Email content contains a site link only. Public reply visibility is checked here.
  const candidates = await query(env, `${visibleComments}
    SELECT c.id,c.reply_hash,s.email,s.notified_hash FROM visible c JOIN comment_subscriptions s ON s.comment_id=c.id
    WHERE c.deleted_at IS NULL AND c.reply!='' AND c.reply_hash!=s.notified_hash AND s.verified_at IS NOT NULL AND s.expires_at>?
    ORDER BY c.updated_at,c.id LIMIT 500`, publicPaths, now).all();
  const groups = new Map();
  for (const comment of candidates.results) {
    const hash = comment.reply_hash;
    if (hash === comment.notified_hash) continue;
    if (!groups.has(comment.email)) groups.set(comment.email, []);
    groups.get(comment.email).push({ id: comment.id, hash });
  }
  let queued = 0;
  for (const [email, comments] of groups) {
    // Bound each hourly invocation to fit the Workers Free D1 query limit.
    if (queued >= 5) break;
    const day = new Date(now).toISOString().slice(0, 10);
    const jobId = 'comment-reply-' + day + '-' + await hmac(env.ABUSE_SECRET, email);
    if (await query(env, 'SELECT 1 FROM comment_mail_jobs WHERE id=?', jobId).first()) continue;
    try { await quota(env, 'global-reply-email', 20, DAY); } catch { break; }
    const claim = crypto.randomUUID();
    await env.DB.batch([
      query(env, `INSERT OR IGNORE INTO comment_mail_jobs(id,claim,kind,email,payload,created_at) VALUES(?,?,'reply',?,?,?)`,
        jobId, claim, email, JSON.stringify({ comments }), now),
      query(env, `UPDATE comment_subscriptions SET notified_hash=(
          SELECT json_extract(value,'$.hash') FROM json_each(?) WHERE json_extract(value,'$.id')=comment_id)
        WHERE comment_id IN (SELECT json_extract(value,'$.id') FROM json_each(?))
          AND EXISTS(SELECT 1 FROM comment_mail_jobs WHERE id=? AND claim=?)`,
        JSON.stringify(comments), JSON.stringify(comments), jobId, claim),
    ]);
    queued++;
  }
  const jobs = await query(env, "SELECT * FROM comment_mail_jobs WHERE kind='reply' AND state IN ('pending','unknown') ORDER BY created_at LIMIT 5").all();
  for (const job of jobs.results) await sendJob(env, job, fetcher, now, publicPaths);
}
