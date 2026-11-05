import registry from './pages.json' with { type: 'json' };
import { adminHTML, adminJS } from './admin-page.mjs';
import { subscribeToComment, confirmCommentEmail, sendReplyDigests } from './comment-mail.mjs';
import { visibleComments, publicCommentFields } from './comment-queries.mjs';
import { adminFilters, dashboard, editStats } from './admin-data.mjs';
import { assert, HttpError, uuid, emailOK, text, list, hmac, readJSON, verifyChallenge, accessVerifier } from './security.mjs';
const RECIPIENT='zq_eugene@qq.com';
const DAY=86400000;
function cursor(value,fallback) { if(!value)return [fallback,'ffffffff-ffff-ffff-ffff-ffffffffffff'];const m=/^(\d{1,16}):([0-9a-f-]{36})$/.exec(value);assert(m&&Number.isSafeInteger(Number(m[1]))&&uuid(m[2]),400,'invalid_cursor');return [Number(m[1]),m[2]]; }
const nextCursor=row=>`${row.created_at}:${row.id}`;

export function createApp({pages=registry,fetcher=fetch,now=()=>Date.now()}={}) {
  const authenticate=accessVerifier(fetcher,now);
  const entries=new Map(pages.map(p=>[p.path,p]));
  const publicPaths=JSON.stringify([...entries.keys()]);
  const q=(env,sql,...args)=>env.DB.prepare(sql).bind(...args);
  const audit=(env,admin,action,target)=>q(env,'INSERT INTO audit VALUES(?,?,?,?,?)',crypto.randomUUID(),admin,action,target,now());
  async function quota(env,key,limit,duration) {
    const bucket=Math.floor(now()/duration);
    const row=await q(env,'INSERT INTO quotas(key,count,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count',`${key}:${bucket}`,(bucket+2)*duration).first();
    assert(row.count<=limit,429,'rate_limited');
  }
  async function identity(req,env,data) {
    assert(uuid(data.visitor),400,'invalid_visitor');
    return {actor:await hmac(env.ABUSE_SECRET,`actor:${data.visitor}`),network:await network(req,env)};
  }
  async function network(req,env) { return hmac(env.ABUSE_SECRET,`network:${new Date(now()).toISOString().slice(0,7)}:${req.headers.get('CF-Connecting-IP')}`); }
  async function banned(env,id) {
    const b=await q(env,"SELECT 1 FROM bans WHERE expires_at>? AND ((kind='actor' AND value=?) OR (kind='network' AND value=?)) LIMIT 1",now(),id.actor,id.network).first();
    assert(!b,403,'blocked');
  }
  async function getPage(env,path) {
    assert(entries.has(path),404,'unknown_page');
    await q(env,'INSERT OR IGNORE INTO pages(path,title) VALUES(?,?)',path,entries.get(path).title).run();
    return q(env,'SELECT * FROM pages WHERE path=?',path).first();
  }
  async function stats(env,page) {
    const row=await q(env,`${visibleComments}
      SELECT (SELECT COUNT(*) FROM likes WHERE page=?) AS total,
        (SELECT COUNT(*) FROM visible WHERE page=? AND deleted_at IS NULL) AS comments,
        (SELECT COUNT(*) FROM visible WHERE deleted_at IS NULL) AS global_comments
    `,publicPaths,page.path,page.path).first();
    return {path:page.path,views:page.views,likes:Math.max(0,row.total+page.likes_adjustment),commentsCount:page.comments_enabled?row.comments:0,globalCommentsCount:row.global_comments,commentsEnabled:!!page.comments_enabled,likesEnabled:!!page.likes_enabled,viewsEnabled:!!page.views_enabled};
  }
  async function publicRoute(req,env,url) {
    if(['/api/public/page','/api/public/replies'].includes(url.pathname)&&req.method==='GET') {
      const page=await getPage(env,url.searchParams.get('page'));
      const [before,beforeId]=cursor(url.searchParams.get('before'),now()+1);
      const parentId=url.searchParams.get('parent');
      const replies=url.pathname==='/api/public/replies';
      if(replies){
        assert(uuid(parentId),400,'invalid_parent');
        const parent=await q(env,`${visibleComments} SELECT id FROM visible WHERE id=? AND parent_id IS NULL AND page=?`,publicPaths,parentId,page.path).first();
        assert(parent,404,'reply_unavailable');
      }
      const rows=await q(env,`${visibleComments}
        SELECT ${publicCommentFields} FROM visible c
        WHERE (?=1 AND c.parent_id=? OR ?=0 AND c.parent_id IS NULL)
          AND (c.created_at<? OR (c.created_at=? AND c.id<?))
        ORDER BY c.created_at DESC,c.id DESC LIMIT 21
      `,publicPaths,+replies,parentId,+replies,before,before,beforeId).all();
      const shown=rows.results.slice(0,20).map(comment=>({
        ...comment,pageTitle:entries.get(comment.page).title
      }));
      return {status:200,body:{...await stats(env,page),comments:shown,nextBefore:rows.results.length>20?nextCursor(shown.at(-1)):null}};
    }
    assert(req.method==='POST',405,'method_not_allowed');
    const data=await readJSON(req),ip=req.headers.get('CF-Connecting-IP');
    assert(data.website==='',400,'invalid_input');
    if(url.pathname==='/api/contact') return contact(req,env,data,ip);
    if(url.pathname==='/api/public/comment-email')return {status:200,body:{code:await confirmCommentEmail(env,data.emailToken,now())}};
    if(['/api/public/my-comments','/api/public/delete-comment'].includes(url.pathname)){
      const owner=await identity(req,env,data);
      if(url.pathname==='/api/public/my-comments'){
        const [before,beforeId]=cursor(data.before,now()+1);
        const rows=await q(env,`SELECT id,page,nickname,body,status,created_at,parent_id FROM comments
          WHERE actor=? AND deleted_at IS NULL AND page IN (SELECT value FROM json_each(?))
          AND (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 21`,owner.actor,publicPaths,before,before,beforeId).all();
        const shown=rows.results.slice(0,20).map(row=>({...row,pageTitle:entries.get(row.page).title}));
        return {status:200,body:{comments:shown,nextBefore:rows.results.length>20?nextCursor(shown.at(-1)):null}};
      }
      assert(uuid(data.id),400,'invalid_id');
      const own=await q(env,'SELECT id,deleted_at FROM comments WHERE id=? AND actor=?',data.id,owner.actor).first();
      assert(own,404,'not_found');
      if(own.deleted_at)return {status:200,body:{code:'deleted'}};
      await quota(env,'delete:'+owner.actor,10,600000);
      await verifyChallenge(data,env,ip,'delete_comment',fetcher);
      await env.DB.batch([
        q(env,"UPDATE comments SET body='',nickname='',reply='',reply_hash='',deleted_at=?,updated_at=? WHERE id=? AND actor=?",now(),now(),data.id,owner.actor),
        q(env,'DELETE FROM comment_subscriptions WHERE comment_id=?',data.id),
        q(env,"UPDATE comment_mail_jobs SET state='cancelled' WHERE id=? AND state!='accepted'",'comment-verify-'+data.id)
      ]);
      return {status:200,body:{code:'deleted'}};
    }

    const page=await getPage(env,data.page);
    if(url.pathname==='/api/public/view') {
      assert(page.views_enabled,403,'views_disabled');
      await quota(env,'global-view',10000,DAY);
      const day=new Date(now()).toISOString().slice(0,10),key=await hmac(env.ABUSE_SECRET,`view:${day}:${ip}`);
      await q(env,'INSERT OR IGNORE INTO view_keys(page,visitor_day,expires_at,recorded_day) VALUES(?,?,?,?)',page.path,key,now()+2*DAY,day).run();
      return {status:200,body:await stats(env,await getPage(env,page.path))};
    }
    const id=await identity(req,env,data);await banned(env,id);
    if(url.pathname==='/api/public/like') {
      assert(page.likes_enabled,403,'likes_disabled');
      await quota(env,'like:'+id.network,10,DAY);
      await verifyChallenge(data,env,ip,'like',fetcher);
      await quota(env,'global-like',1000,DAY);
      await q(env,'INSERT OR IGNORE INTO likes(page,actor,network,created_at) VALUES(?,?,?,?)',page.path,id.actor,id.network,now()).run();
      return {status:200,body:{...await stats(env,page),liked:true}};
    }
    assert(url.pathname==='/api/public/comment',404,'not_found');
    assert(page.comments_enabled,403,'comments_disabled');
    const nickname=text(data.nickname,40),body=text(data.body,2000);
    const email=String(data.email||'').trim().toLowerCase();
    assert(!email||emailOK(email),400,'invalid_email');
    assert((body.match(/https?:\/\//gi)||[]).length<=2,400,'too_many_links');assert(uuid(data.requestId),400,'invalid_request');
    const replyToId=data.replyToId??null;
    assert(replyToId===null||uuid(replyToId),400,'invalid_parent');
    const contentIdentity=[page.path,nickname,body,id.actor];
    if(replyToId)contentIdentity.push(replyToId);
    if(email)contentIdentity.push(email);
    const payloadHash=await hmac(env.ABUSE_SECRET,JSON.stringify(contentIdentity));
    const existing=await q(env,'SELECT id,actor,payload_hash,deleted_at FROM comments WHERE request_id=?',data.requestId).first();
    if(existing){assert(existing.payload_hash===payloadHash,409,'request_conflict');assert(!existing.deleted_at,409,'comment_deleted');return {status:202,body:{code:'pending_review',id:existing.id,notification:await subscribeToComment(env,existing,email,id.network,quota,fetcher,now())}};}
    let parentId=null;
    if(replyToId){
      const target=await q(env,`${visibleComments} SELECT id,parent_id FROM visible WHERE id=? AND page=? AND deleted_at IS NULL`,publicPaths,replyToId,page.path).first();
      assert(target,404,'reply_unavailable');
      parentId=target.parent_id||target.id;
    }
    await quota(env,'comment:'+id.network,3,600000);
    await verifyChallenge(data,env,ip,'comment',fetcher);
    await quota(env,'global-comment',100,DAY);
    // All anonymous content is moderated; HTML and links are rendered only as text.
    await q(env,`INSERT OR IGNORE INTO comments(id,page,nickname,body,actor,network,request_id,payload_hash,created_at,updated_at,parent_id,reply_to_id)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?
      WHERE EXISTS(SELECT 1 FROM pages WHERE path=? AND comments_enabled=1)
        AND (? IS NULL OR EXISTS(
          SELECT 1 FROM comments target JOIN comments parent ON parent.id=?
          WHERE target.id=? AND target.page=? AND target.status='approved' AND target.deleted_at IS NULL
            AND parent.status='approved' AND parent.parent_id IS NULL AND parent.page=target.page
        ))`,crypto.randomUUID(),page.path,nickname,body,id.actor,id.network,data.requestId,payloadHash,now(),now(),parentId,replyToId,
      page.path,replyToId,parentId,replyToId,page.path).run();
    // Another request can win the unique request_id while challenge verification awaits.
    const saved=await q(env,'SELECT id,actor,payload_hash FROM comments WHERE request_id=?',data.requestId).first();
    assert(saved,409,'reply_unavailable');
    assert(saved.payload_hash===payloadHash,409,'request_conflict');
    return {status:202,body:{code:'pending_review',id:saved.id,notification:await subscribeToComment(env,saved,email,id.network,quota,fetcher,now())}};
  }
  async function contact(req,env,data,ip) {
    assert(emailOK(data.email)&&uuid(data.requestId),400,'invalid_input');const email=data.email.trim(),body=text(data.body,5000);
    assert(env.RESEND_API_KEY&&emailOK(env.MAIL_FROM),503,'mail_unconfigured');
    const payloadHash=await hmac(env.ABUSE_SECRET,JSON.stringify([email,body]));
    const existing=await q(env,'SELECT * FROM messages WHERE request_id=?',data.requestId).first();
    if(existing){assert(existing.payload_hash===payloadHash,409,'request_conflict');if(existing.state==='accepted')return {status:202,body:{code:'accepted'}};assert(now()-existing.created_at<23*3600000,409,'retry_window_expired');}
    const net=await network(req,env);await banned(env,{actor:'',network:net});await quota(env,'mail:'+net,3,600000);
    await verifyChallenge(data,env,ip,'contact',fetcher);
    await quota(env,'global-mail',20,DAY);
    await q(env,"INSERT OR IGNORE INTO messages(id,request_id,payload_hash,email,body,state,created_at) VALUES(?,?,?,?,?,'sending',?)",existing?.id||crypto.randomUUID(),data.requestId,payloadHash,email,body,now()).run();
    const saved=await q(env,'SELECT * FROM messages WHERE request_id=?',data.requestId).first();
    assert(saved?.payload_hash===payloadHash,409,'request_conflict');
    if(saved.state==='accepted')return {status:202,body:{code:'accepted'}};
    const id=saved.id;
    try {
      const res=await fetcher('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`contact-${data.requestId}-${payloadHash}`},body:JSON.stringify({from:env.MAIL_FROM,to:[RECIPIENT],reply_to:email,subject:'来自个人网站的私密留言',text:`回复邮箱：${email}\n\n${body}`}),signal:AbortSignal.timeout(10000)});
      if(!res.ok){await q(env,"UPDATE messages SET state='failed' WHERE id=? AND state!='accepted'",id).run();throw new HttpError(502,'mail_failed');}
      const result=await res.json();assert(typeof result.id==='string'&&result.id,502,'mail_unconfirmed');
      await q(env,"UPDATE messages SET state='accepted',provider_id=? WHERE id=?",result.id,id).run();
      return {status:202,body:{code:'accepted'}};
    }catch(error){if(!(error instanceof HttpError&&error.code==='mail_failed'))await q(env,"UPDATE messages SET state='unknown' WHERE id=? AND state!='accepted'",id).run();throw error;}
  }
  async function adminRoute(req,env,url,admin) {
    if(url.pathname==='/admin'||url.pathname==='/admin/')return {raw:new Response(adminHTML,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",'Referrer-Policy':'no-referrer','X-Frame-Options':'DENY'}})};
    if(url.pathname==='/admin/app.js')return {raw:new Response(adminJS,{headers:{'Content-Type':'application/javascript','Cache-Control':'no-store'}})};
    if(req.method==='GET'&&url.pathname==='/api/admin/dashboard')return {status:200,body:await dashboard(env,url,now())};
    if(req.method==='GET'&&url.pathname==='/api/admin/data') {
      await env.DB.batch([...entries.values()].map(p=>q(env,'INSERT OR IGNORE INTO pages(path,title) VALUES(?,?)',p.path,p.title)));
      const status=url.searchParams.get('status')||'pending';assert(['pending','approved','rejected'].includes(status),400,'invalid_status');
      const [before,beforeId]=cursor(url.searchParams.get('before'),now()+1);
      const {page,actor,network}=adminFilters(url);
      const [comments,messages,settings,bans,log]=await env.DB.batch([
        q(env,"SELECT * FROM comments WHERE status=? AND (created_at<? OR (created_at=? AND id<?)) AND (?='' OR page=?) AND (?='' OR actor=?) AND (?='' OR network=?) ORDER BY created_at DESC,id DESC LIMIT 51",status,before,before,beforeId,page,page,actor,actor,network,network),
        q(env,'SELECT id,email,body,state,handled_at,created_at FROM messages WHERE created_at<? OR (created_at=? AND id<?) ORDER BY created_at DESC,id DESC LIMIT 51',before,before,beforeId),
        q(env,'SELECT p.*, MAX(0,p.likes_adjustment+(SELECT COUNT(*) FROM likes l WHERE l.page=p.path)) AS likes, (SELECT COUNT(*) FROM likes l WHERE l.page=p.path) AS recorded_likes, (SELECT COUNT(*) FROM comments c WHERE c.page=p.path) AS comment_count FROM pages p ORDER BY p.path'),
        q(env,'SELECT * FROM bans WHERE expires_at>? ORDER BY expires_at LIMIT 100',now()),
        q(env,'SELECT admin,action,target,created_at FROM audit ORDER BY created_at DESC LIMIT 50')]);
      return {status:200,body:{admin,comments:comments.results.slice(0,50),messages:messages.results.slice(0,50),pages:settings.results,bans:bans.results,audit:log.results,
        nextCommentsBefore:comments.results.length>50?nextCursor(comments.results[49]):null,nextMessagesBefore:messages.results.length>50?nextCursor(messages.results[49]):null}};
    }
    assert(url.pathname==='/api/admin/action',404,'not_found');
    assert(req.method==='POST',405,'method_not_allowed');
    assert(req.headers.get('Origin')===url.origin&&req.headers.get('X-Admin-Action')==='1',403,'csrf_denied');
    const data=await readJSON(req);const action=text(data.action,40);
    if(action==='moderate'||action==='reply'||action==='delete_comment'||action==='ban_comment') {
      assert(uuid(data.id),400,'invalid_id');const row=await q(env,'SELECT * FROM comments WHERE id=?',data.id).first();assert(row,404,'not_found');
      const queries=[];
      if(action==='moderate'){assert(['approved','rejected','pending'].includes(data.status),400,'invalid_status');queries.push(q(env,'UPDATE comments SET status=?,updated_at=? WHERE id=?',data.status,now(),row.id));}
      if(action==='reply'){
        assert(!row.deleted_at,409,'comment_deleted');
        const reply=text(data.reply,2000,true);
        queries.push(q(env,'UPDATE comments SET reply=?,reply_hash=?,updated_at=? WHERE id=? AND deleted_at IS NULL',reply,await hmac(env.ABUSE_SECRET,reply),now(),row.id));
      }
      if(action==='delete_comment')queries.push(q(env,'DELETE FROM comments WHERE id=?',row.id));
      if(action==='ban_comment')for(const [kind,value] of [['actor',row.actor],['network',row.network]])queries.push(q(env,'INSERT OR REPLACE INTO bans VALUES(?,?,?)',kind,value,now()+30*DAY));
      queries.push(action==='reply'
        ? q(env,'INSERT INTO audit SELECT ?,?,?,?,? WHERE changes()>0',crypto.randomUUID(),admin,action,row.id,now())
        : audit(env,admin,action+(action==='moderate'?':'+data.status:''),row.id));
      const results=await env.DB.batch(queries);
      if(action==='reply')assert(results[0].meta.changes===1,409,'comment_deleted');
    }else if(action==='edit_stats') {
      assert(entries.has(data.page),400,'unknown_page');
      await editStats(env,data,admin,now());
    }else if(action==='delete_like') {
      assert(entries.has(data.page)&&/^[a-f0-9]{64}$/.test(data.actor)&&Number.isSafeInteger(data.createdAt),400,'invalid_input');
      assert(data.confirm===data.page,400,'confirmation_required');
      await env.DB.batch([
        q(env,'INSERT INTO audit SELECT ?,?,?,?,? FROM likes WHERE page=? AND actor=? AND created_at=?',crypto.randomUUID(),admin,action,data.page+':'+data.actor,now(),data.page,data.actor,data.createdAt),
        q(env,'DELETE FROM likes WHERE page=? AND actor=? AND created_at=?',data.page,data.actor,data.createdAt)
      ]);
    }else if(action==='settings'||action==='reset') {
      assert(entries.has(data.page),400,'unknown_page');await getPage(env,data.page);
      if(action==='settings'){
        assert(['comments','likes','views'].every(k=>typeof data[k]==='boolean'),400,'invalid_input');
        await env.DB.batch([q(env,'UPDATE pages SET comments_enabled=?,likes_enabled=?,views_enabled=? WHERE path=?',+data.comments,+data.likes,+data.views,data.page),audit(env,admin,action,data.page)]);
      }else{
        assert(data.confirm===data.page&&['likes','views'].includes(data.metric),400,'confirmation_required');
        const statements=data.metric==='likes'?[q(env,'DELETE FROM likes WHERE page=?',data.page),q(env,'UPDATE pages SET likes_adjustment=0 WHERE path=?',data.page)]:[q(env,'DELETE FROM view_keys WHERE page=?',data.page),q(env,'UPDATE pages SET views=0 WHERE path=?',data.page)];
        await env.DB.batch([...statements,audit(env,admin,'reset:'+data.metric,data.page)]);
      }
    }else if(action==='delete_message'||action==='handle_message'){
      assert(uuid(data.id),400,'invalid_id');const r=await q(env,'SELECT id FROM messages WHERE id=?',data.id).first();assert(r,404,'not_found');
      const statement=action==='delete_message'?q(env,'DELETE FROM messages WHERE id=?',data.id):q(env,'UPDATE messages SET handled_at=? WHERE id=?',now(),data.id);
      await env.DB.batch([statement,audit(env,admin,action,data.id)]);
    }else if(action==='unban'){
      assert(['actor','network'].includes(data.kind)&&/^[a-f0-9]{64}$/.test(data.value),400,'invalid_input');
      await env.DB.batch([q(env,'DELETE FROM bans WHERE kind=? AND value=?',data.kind,data.value),audit(env,admin,action,data.kind+':'+data.value.slice(0,12))]);
    }else throw new HttpError(400,'unknown_action');
    return {status:200,body:{code:'saved'}};
  }
  const fetchHandler=async (req,env)=>{
    const url=new URL(req.url),isAdmin=url.pathname==='/admin'||url.pathname.startsWith('/admin/')||url.pathname.startsWith('/api/admin/');
    const origin=req.headers.get('Origin'),allowed=list(env.ALLOWED_ORIGINS).includes(origin);
    const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin',...(!isAdmin&&allowed?{'Access-Control-Allow-Origin':origin}:{})};
    try{
      assert(env.DB,503,'service_unconfigured');
      if(isAdmin){const admin=await authenticate(req,env);const res=await adminRoute(req,env,url,admin);return res.raw||new Response(JSON.stringify({ok:true,...res.body}),{status:res.status,headers});}
      assert(['/api/public/page','/api/public/replies','/api/public/view','/api/public/like','/api/public/comment','/api/public/my-comments','/api/public/delete-comment','/api/public/comment-email','/api/contact'].includes(url.pathname),404,'not_found');
      if(req.method==='OPTIONS'){assert(allowed,403,'forbidden');return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});}
      if(req.method!=='GET')assert(allowed,403,'forbidden');
      assert(typeof env.ABUSE_SECRET==='string'&&env.ABUSE_SECRET.length>=32&&env.PUBLIC_LIMITER&&env.GLOBAL_LIMITER,503,'protection_unconfigured');
      const ip=req.headers.get('CF-Connecting-IP');assert(ip,503,'protection_unavailable');
      assert((await env.PUBLIC_LIMITER.limit({key:await hmac(env.ABUSE_SECRET,`rate:${ip}`)})).success,429,'rate_limited');
      assert((await env.GLOBAL_LIMITER.limit({key:'public-all'})).success,429,'rate_limited');
      const res=await publicRoute(req,env,url);return new Response(JSON.stringify({ok:true,...res.body}),{status:res.status,headers});
    }catch(e){return new Response(JSON.stringify({ok:false,code:e instanceof HttpError?e.code:'temporarily_unavailable'}),{status:e instanceof HttpError?e.status:503,headers});}
  };
  const cleanup=async env=>env.DB.batch([
    q(env,'DELETE FROM quotas WHERE expires_at<?',now()),q(env,'DELETE FROM view_keys WHERE expires_at<?',now()),q(env,'DELETE FROM bans WHERE expires_at<?',now()),
    q(env,'UPDATE likes SET network=NULL WHERE network IS NOT NULL AND created_at<?',now()-31*DAY),
    q(env,'DELETE FROM messages WHERE created_at<?',now()-30*DAY),q(env,"DELETE FROM comments WHERE status!='approved' AND created_at<?",now()-30*DAY),q(env,'DELETE FROM audit WHERE created_at<?',now()-90*DAY),
    q(env,'DELETE FROM comment_subscriptions WHERE expires_at<?',now()),
    q(env,'DELETE FROM comment_mail_jobs WHERE created_at<?',now()-30*DAY)]);
  const scheduled=async (event,env)=>{
    if(event.cron==='17 3 * * *')await cleanup(env);
    else await sendReplyDigests(env,publicPaths,quota,fetcher,now());
  };
  return {fetch:fetchHandler,scheduled:(event,env,ctx)=>ctx.waitUntil(scheduled(event,env)),cleanup,sendReplyDigests:env=>sendReplyDigests(env,publicPaths,quota,fetcher,now())};
}
export default createApp();
