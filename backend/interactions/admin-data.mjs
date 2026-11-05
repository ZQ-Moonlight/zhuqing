import { assert, text } from './security.mjs';

export function adminFilters(url) {
  const page = url.searchParams.get('page') || '';
  const actor = url.searchParams.get('actor') || '';
  const network = url.searchParams.get('network') || '';
  assert(page.length <= 500, 400, 'invalid_page');
  assert([actor, network].every(value => !value || /^[a-f0-9]{64}$/.test(value)), 400, 'invalid_identity');
  return { page, actor, network };
}

export async function dashboard(env, url, now) {
  const { page, actor, network } = adminFilters(url);
  const after = url.searchParams.get('after') || '';
  assert(after.length <= 600, 400, 'invalid_cursor');
  const since = new Date(now - 29 * 86400000).toISOString().slice(0, 10);
  const query = (sql, ...values) => env.DB.prepare(sql).bind(...values);
  const filter = "(?='' OR page=?) AND (?='' OR actor=?) AND (?='' OR network=?)";
  const values = [page, page, actor, actor, network, network];
  const [likes, totals, views, likeDays, commentDays, meta] = await env.DB.batch([
    query(`SELECT * FROM likes WHERE ${filter} AND page||':'||actor>? ORDER BY page||':'||actor LIMIT 51`, ...values, after),
    query(`SELECT COUNT(*) likes,COUNT(DISTINCT actor) visitors,COUNT(DISTINCT network) networks FROM likes WHERE ${filter}`, ...values),
    query("SELECT day,SUM(views) count FROM daily_views WHERE day>=? AND (?='' OR page=?) GROUP BY day ORDER BY day", since, page, page),
    query(`SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') day,COUNT(*) count FROM likes WHERE ${filter} AND created_at>=? GROUP BY day ORDER BY day`, ...values, Date.parse(since)),
    query(`SELECT strftime('%Y-%m-%d',created_at/1000,'unixepoch') day,COUNT(*) count FROM comments WHERE ${filter} AND created_at>=? GROUP BY day ORDER BY day`, ...values, Date.parse(since)),
    query('SELECT value FROM analytics_meta WHERE key=?', 'views_started'),
  ]);
  const shown = likes.results.slice(0, 50);
  return {
    likes: shown, totals: totals.results[0],
    next: likes.results.length > 50 ? shown.at(-1).page + ':' + shown.at(-1).actor : null,
    trends: { views: views.results, likes: likeDays.results, comments: commentDays.results },
    viewsStarted: meta.results[0]?.value, since,
  };
}

export async function editStats(env, data, admin, now) {
  assert(data.confirm === data.page, 400, 'confirmation_required');
  assert([data.views, data.likes, data.expectedViews, data.expectedLikes].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 1000000000), 400, 'invalid_count');
  const reason = text(data.reason, 200);
  const condition = 'path=? AND views=? AND MAX(0,likes_adjustment+(SELECT COUNT(*) FROM likes WHERE page=pages.path))=?';
  const values = [data.page, data.expectedViews, data.expectedLikes];
  const record = JSON.stringify({ page: data.page, before: { views: data.expectedViews, likes: data.expectedLikes }, after: { views: data.views, likes: data.likes }, reason });
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO audit SELECT ?,?,?,?,? FROM pages WHERE ${condition}`).bind(crypto.randomUUID(), admin, 'edit_stats', record, now, ...values),
    env.DB.prepare(`UPDATE pages SET views=?,likes_adjustment=?-(SELECT COUNT(*) FROM likes WHERE page=pages.path) WHERE ${condition} RETURNING path`).bind(data.views, data.likes, ...values),
  ]);
  assert(results[1].results.length === 1, 409, 'stats_changed_refresh');
}
