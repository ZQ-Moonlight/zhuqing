import test from 'node:test';import assert from 'node:assert/strict';
import {fixture,jwt} from './test-support.mjs';
import {accessVerifier,readJSON} from './security.mjs';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createApp } from './worker.mjs';
const json=async p=>(await p).json();

test('nickname is required and only the author browser can erase its comment while preserving other replies', async () => {
 const f=await fixture();
 assert.equal((await f.request('/api/public/comment',f.payload('comment',{nickname:'   '}))).status,400);
 const owner=f.payload();const created=await json(f.request('/api/public/comment',owner));
 await f.admin({action:'moderate',id:created.id,status:'approved'});
 const other=f.payload('comment',{replyToId:created.id});
 const child=await json(f.request('/api/public/comment',other));await f.admin({action:'moderate',id:child.id,status:'approved'});
 const mine=await json(f.request('/api/public/my-comments',{visitor:owner.visitor,website:''}));
 assert.deepEqual(mine.comments.map(row=>row.id),[created.id]);
 assert.equal((await f.request('/api/public/delete-comment',f.payload('delete_comment',{id:created.id,visitor:other.visitor}))).status,404);
 const deletion=f.payload('delete_comment',{id:created.id,visitor:owner.visitor});
 assert.equal((await f.request('/api/public/delete-comment',deletion)).status,200);
 assert.equal((await f.request('/api/public/delete-comment',deletion)).status,200);
 const page=await json(f.request('/api/public/page?page=/'));
 assert.equal(page.globalCommentsCount,1);assert.equal(page.comments[0].body,'');assert.equal(page.comments[0].nickname,'');assert.ok(page.comments[0].deleted_at);
 const replies=await json(f.request('/api/public/replies?page=/&parent='+created.id));
 assert.equal(replies.comments[0].id,child.id);assert.equal(replies.comments[0].replyToName,null);
 assert.equal((await f.request('/api/public/comment',owner)).status,409);
});

test('optional email is private, verified before notifications, and verification retries do not send duplicates', async () => {
 const f=await fixture();const payload=f.payload('comment',{email:'Reader@example.com'});
 const created=await json(f.request('/api/public/comment',payload));
 assert.equal(created.notification,'verification_sent');
 await f.request('/api/public/comment',payload);
 let mailCalls=f.calls.filter(call=>call.url.includes('api.resend.com'));
 assert.equal(mailCalls.length,1);
 assert.deepEqual(JSON.parse(mailCalls[0].init.body).to,['reader@example.com']);
 await f.admin({action:'moderate',id:created.id,status:'approved'});await f.admin({action:'reply',id:created.id,reply:'Thanks for visiting'});
 await f.app.sendReplyDigests(f.env);
 assert.equal(f.calls.filter(call=>call.url.includes('api.resend.com')).length,1);
 const verification=JSON.parse(mailCalls[0].init.body).text.match(/#comment-email=(verify\.[^\s]+)/)[1];
 assert.equal((await f.request('/api/public/comment-email',{emailToken:verification+'x',website:''})).status,400);
 assert.equal((await json(f.request('/api/public/comment-email',{emailToken:verification,website:''}))).code,'subscribed');
 await f.app.sendReplyDigests(f.env);await f.app.sendReplyDigests(f.env);
 mailCalls=f.calls.filter(call=>call.url.includes('api.resend.com'));assert.equal(mailCalls.length,2);
 const publicData=JSON.stringify(await json(f.request('/api/public/page?page=/')));
 assert.ok(!publicData.includes('reader@example.com'));assert.ok(!publicData.includes(verification));
 const another=await json(f.request('/api/public/comment',f.payload('comment',{email:'reader@example.com',visitor:payload.visitor})));
 assert.equal(another.notification,'enabled');assert.equal(f.calls.filter(call=>call.url.includes('api.resend.com')).length,2);
 const unsubscribe=JSON.parse(mailCalls[1].init.body).text.match(/#comment-email=(unsubscribe\.[^\s]+)/)[1];
 assert.equal((await json(f.request('/api/public/comment-email',{emailToken:unsubscribe,website:''}))).code,'unsubscribed');
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM comment_subscriptions').get().n,0);
});

test('reply notifications go only to the author of the exact comment answered by the site owner', async () => {
 const f=await fixture();
 const first=await json(f.request('/api/public/comment',f.payload('comment',{email:'first@example.com'})));
 const second=await json(f.request('/api/public/comment',f.payload('comment',{email:'second@example.com'})));
 for(const id of [first.id,second.id])await f.admin({action:'moderate',id,status:'approved'});
 f.DB.db.prepare('UPDATE comment_subscriptions SET verified_at=?').run(f.clock.value);
 const visitorReply=await json(f.request('/api/public/comment',f.payload('comment',{replyToId:first.id})));
 await f.admin({action:'moderate',id:visitorReply.id,status:'approved'});
 await f.app.sendReplyDigests(f.env);
 const replies=()=>f.calls.filter(call=>call.url.includes('api.resend.com')&&JSON.parse(call.init.body).subject.includes('收到了'));
 assert.equal(replies().length,0);
 await f.admin({action:'reply',id:second.id,reply:'Reply to second visitor'});
 await f.app.sendReplyDigests(f.env);
 assert.deepEqual(replies().map(call=>JSON.parse(call.init.body).to),[['second@example.com']]);
 await f.admin({action:'reply',id:visitorReply.id,reply:'Reply to the child comment'});
 await f.app.sendReplyDigests(f.env);
 assert.equal(replies().length,1);
 await f.admin({action:'reply',id:first.id,reply:'Reply to first visitor'});
 await f.app.sendReplyDigests(f.env);
 assert.deepEqual(replies().map(call=>JSON.parse(call.init.body).to),[['second@example.com'],['first@example.com']]);
});

test('daily notifications coalesce same-mailbox replies and defer later changes until the next day', async () => {
 const f=await fixture();const author=f.payload('comment',{email:'reader@example.com'});
 const first=await json(f.request('/api/public/comment',author));
 const verifyMail=f.calls.find(call=>call.url.includes('api.resend.com'));
 const emailToken=JSON.parse(verifyMail.init.body).text.match(/#comment-email=(verify\.[^\s]+)/)[1];
 await f.request('/api/public/comment-email',{emailToken,website:''});
 const second=await json(f.request('/api/public/comment',f.payload('comment',{email:'reader@example.com',visitor:author.visitor})));
 for(const id of [first.id,second.id]){await f.admin({action:'moderate',id,status:'approved'});await f.admin({action:'reply',id,reply:'First reply'});}
 await Promise.all([f.app.sendReplyDigests(f.env),f.app.sendReplyDigests(f.env)]);
 const jobs=f.DB.db.prepare("SELECT * FROM comment_mail_jobs WHERE kind='reply'").all();assert.equal(jobs.length,1);
 const sends=f.calls.filter(call=>call.url.includes('api.resend.com')&&JSON.parse(call.init.body).subject.includes('收到了'));
 assert.equal(new Set(sends.map(call=>call.init.headers['Idempotency-Key'])).size,1);
 await f.admin({action:'reply',id:first.id,reply:'Updated reply'});
 await f.app.sendReplyDigests(f.env);assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM comment_mail_jobs WHERE kind='reply'").get().n,1);
 f.clock.value+=86400000;await f.app.sendReplyDigests(f.env);
 assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM comment_mail_jobs WHERE kind='reply'").get().n,2);
});

test('queued digest checks current visibility and survives removal of another subscribed comment', async () => {
 for (const mutation of ['delete-first','hide-page','hide-parent']) {
  const f=await fixture();
  const first=await json(f.request('/api/public/comment',f.payload('comment',{email:'reader@example.com'})));
  await f.admin({action:'moderate',id:first.id,status:'approved'});
  const second=await json(f.request('/api/public/comment',f.payload('comment',{email:'reader@example.com',...(mutation==='hide-parent'?{replyToId:first.id}:{})})));
  for (const id of [first.id,second.id]) {
   await f.admin({action:'moderate',id,status:'approved'});
   await f.admin({action:'reply',id,reply:'Reply'});
  }
  f.DB.db.prepare('UPDATE comment_subscriptions SET verified_at=?').run(f.clock.value);
  const batch=f.DB.batch.bind(f.DB);
  f.DB.batch=async statements=>{
   const result=await batch(statements);
   if (mutation==='delete-first') {
    f.DB.db.prepare('DELETE FROM comments WHERE id=?').run(first.id);
   } else if (mutation==='hide-page') {
    f.DB.db.prepare('UPDATE pages SET comments_enabled=0').run();
   } else {
    f.DB.db.prepare("UPDATE comments SET status='rejected' WHERE id=?").run(first.id);
   }
   return result;
  };
  await f.app.sendReplyDigests(f.env);
  const sends=f.calls.filter(call=>call.url.includes('api.resend.com')&&JSON.parse(call.init.body).subject.includes('收到了'));
  assert.equal(sends.length,mutation==='delete-first'?1:0);
  if (sends.length) {
   const emailToken=JSON.parse(sends[0].init.body).text.match(/#comment-email=(unsubscribe\.[^\s]+)/)[1];
   assert.equal((await json(f.request('/api/public/comment-email',{emailToken,website:''}))).code,'unsubscribed');
   assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM comment_subscriptions').get().n,0);
  }
 }
});

test('author deletion racing an administrator reply cannot resurrect content or record a successful reply', async () => {
 const f=await fixture();const created=await json(f.request('/api/public/comment',f.payload()));
 const batch=f.DB.batch.bind(f.DB);
 f.DB.batch=async statements=>{
  f.DB.db.prepare("UPDATE comments SET body='',nickname='',reply='',deleted_at=? WHERE id=?").run(f.clock.value,created.id);
  return batch(statements);
 };
 assert.equal((await f.admin({action:'reply',id:created.id,reply:'Reply after deletion'})).status,409);
 assert.equal(f.DB.db.prepare('SELECT reply FROM comments WHERE id=?').get(created.id).reply,'');
 assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='reply'").get().n,0);
});

test('verification expires and uncertain digest retries stop before the provider deduplication window', async () => {
 const f=await fixture();
 const first=await json(f.request('/api/public/comment',f.payload('comment',{email:'reader@example.com'})));
 const verification=f.calls.find(call=>call.url.includes('api.resend.com'));
 const emailToken=JSON.parse(verification.init.body).text.match(/#comment-email=(verify\.[^\s]+)/)[1];
 await f.admin({action:'moderate',id:first.id,status:'approved'});
 await f.admin({action:'reply',id:first.id,reply:'Reply'});
 f.clock.value+=86400000;
 assert.equal((await f.request('/api/public/comment-email',{emailToken,website:''})).status,410);
 f.DB.db.prepare('UPDATE comment_subscriptions SET verified_at=?,expires_at=?').run(f.clock.value,f.clock.value+90*86400000);
 f.scenario.throwMail=true;await f.app.sendReplyDigests(f.env);
 const count=f.calls.length;f.clock.value+=23*3600000;
 await f.app.sendReplyDigests(f.env);
 assert.equal(f.calls.length,count);
 assert.equal(f.DB.db.prepare("SELECT state FROM comment_mail_jobs WHERE kind='reply'").get().state,'expired');
});

test('digest batches stay within free-plan query limits and continue remaining mailboxes next invocation', async () => {
 const f=await fixture();await f.request('/api/public/page?page=/');
 for(let index=0;index<12;index++){
  const id=crypto.randomUUID();
  f.DB.db.prepare("INSERT INTO comments(id,page,nickname,body,status,actor,network,request_id,payload_hash,created_at,updated_at,reply,reply_hash) VALUES(?,'/','Reader','Comment','approved','actor','network',?,'payload',?,?,'Reply','reply-hash')").run(id,crypto.randomUUID(),f.clock.value,f.clock.value);
  f.DB.db.prepare('INSERT INTO comment_subscriptions(comment_id,email,created_at,verified_at,expires_at) VALUES(?,?,?,?,?)').run(id,`reader${index}@example.com`,f.clock.value,f.clock.value,f.clock.value+86400000);
 }
 const prepare=f.DB.prepare.bind(f.DB);let queries=0;
 f.DB.prepare=sql=>{queries++;return prepare(sql);};
 for(const expected of [5,10,12]){
  queries=0;await f.app.sendReplyDigests(f.env);
  assert.ok(queries<=50,`Used ${queries} D1 statements`);
  assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM comment_mail_jobs WHERE kind='reply' AND state='accepted'").get().n,expected);
 }
});

test('failed email setup preserves comment and self-deletion removes subscriptions', async () => {
 const f=await fixture();f.scenario.throwMail=true;
 const payload=f.payload('comment',{email:'reader@example.com'});
 const result=await json(f.request('/api/public/comment',payload));
 assert.equal(result.code,'pending_review');assert.equal(result.notification,'unavailable');
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM comments').get().n,1);
 f.scenario.throwMail=false;await f.request('/api/public/comment',payload);
 const sends=f.calls.filter(call=>call.url.includes('api.resend.com'));
 assert.equal(sends[0].init.headers['Idempotency-Key'],sends[1].init.headers['Idempotency-Key']);
 await f.request('/api/public/delete-comment',f.payload('delete_comment',{id:result.id,visitor:payload.visitor}));
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM comment_subscriptions').get().n,0);
});

test('visitors reply to comments and replies, with moderation and source binding', async () => {
 const f=await fixture();await f.request('/api/public/comment',f.payload());
 const parent=(await json(f.admin())).comments[0];
 await f.admin({action:'moderate',id:parent.id,status:'approved'});
 const payload=f.payload('comment',{replyToId:parent.id,body:'Reply text'});
 assert.equal((await f.request('/api/public/comment',payload)).status,202);
 let page=await json(f.request('/api/public/page?page=/portfolio/puguang/'));
 assert.equal(page.comments[0].replyCount,0);assert.equal(page.globalCommentsCount,1);
 const reply=(await json(f.admin())).comments[0];
 assert.equal(reply.parent_id,parent.id);assert.equal(reply.reply_to_id,parent.id);
 await f.admin({action:'moderate',id:reply.id,status:'approved'});
 assert.equal((await f.request('/api/public/comment',f.payload('comment',{replyToId:reply.id,body:'Reply to a reply'}))).status,202);
 const nested=(await json(f.admin())).comments[0];
 assert.equal(nested.parent_id,parent.id);assert.equal(nested.reply_to_id,reply.id);
 await f.admin({action:'moderate',id:nested.id,status:'approved'});
 const thread=await json(f.request('/api/public/replies?page=/&parent='+parent.id));
 assert.equal(thread.comments.length,2);assert.ok(thread.comments.every(row=>row.page==='/'&&row.replyToName==='访客'));
 assert.equal((await f.request('/api/public/comment',{...payload,replyToId:reply.id})).status,409);
 assert.equal((await f.request('/api/public/comment',f.payload('comment',{page:'/portfolio/puguang/',replyToId:parent.id}))).status,404);
 page=await json(f.request('/api/public/page?page=/'));assert.equal(page.comments.length,1);assert.equal(page.comments[0].replyCount,2);assert.equal(page.globalCommentsCount,3);
});

test('hidden parents hide their replies and parent deletion cascades without exposing private context', async () => {
 const f=await fixture();await f.request('/api/public/comment',f.payload());
 const parent=(await json(f.admin())).comments[0];await f.admin({action:'moderate',id:parent.id,status:'approved'});
 await f.request('/api/public/comment',f.payload('comment',{replyToId:parent.id}));
 const reply=(await json(f.admin())).comments[0];await f.admin({action:'moderate',id:reply.id,status:'approved'});
 await f.admin({action:'moderate',id:parent.id,status:'rejected'});
 assert.equal((await f.request('/api/public/replies?page=/&parent='+parent.id)).status,404);
 const hidden=await json(f.request('/api/public/page?page=/'));assert.equal(hidden.globalCommentsCount,0);assert.deepEqual(hidden.comments,[]);
 await f.admin({action:'delete_comment',id:parent.id});
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM comments').get().n,0);
});

test('reply pagination handles tied timestamps and deletion during challenge verification fails closed', async () => {
 const f=await fixture();await f.request('/api/public/comment',f.payload());
 const parent=(await json(f.admin())).comments[0];await f.admin({action:'moderate',id:parent.id,status:'approved'});
 for(let index=0;index<23;index++)f.DB.db.prepare("INSERT INTO comments(id,page,nickname,body,status,actor,network,request_id,payload_hash,created_at,updated_at,parent_id,reply_to_id) VALUES(?,'/','Reply','Body','approved','hash','hash',?,'hash',?,?,?,?)").run(crypto.randomUUID(),crypto.randomUUID(),f.clock.value,f.clock.value,parent.id,parent.id);
 const first=await json(f.request('/api/public/replies?page=/&parent='+parent.id));
 const second=await json(f.request('/api/public/replies?page=/&parent='+parent.id+'&before='+encodeURIComponent(first.nextBefore)));
 assert.equal(first.comments.length,20);assert.equal(second.comments.length,3);
 assert.equal(new Set([...first.comments,...second.comments].map(row=>row.id)).size,23);
 f.env.TURNSTILE_SECRET_KEY={get:async()=>{f.DB.db.prepare('DELETE FROM comments WHERE id=?').run(parent.id);return 'test';}};
 assert.equal((await f.request('/api/public/comment',f.payload('comment',{replyToId:parent.id}))).status,409);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM comments').get().n,0);
});

test('shared feed includes source titles, paginates across pages and excludes disabled or unregistered sources', async () => {
 const f=await fixture();await f.admin();
 for(let index=0;index<25;index++){
  const page=index%2?'/':'/portfolio/puguang/';
  f.DB.db.prepare("INSERT INTO comments(id,page,nickname,body,status,actor,network,request_id,payload_hash,created_at,updated_at) VALUES(?,?,'Reader','Public text','approved','private-actor','private-network',?,'hash',?,?)").run(crypto.randomUUID(),page,crypto.randomUUID(),f.clock.value,f.clock.value);
 }
 await f.request('/api/public/comment',f.payload());
 const first=await json(f.request('/api/public/page?page=/'));
 const second=await json(f.request('/api/public/page?page=/&before='+encodeURIComponent(first.nextBefore)));
 assert.equal(first.globalCommentsCount,25);assert.equal(first.commentsCount,12);
 assert.equal(first.comments.length,20);assert.equal(second.comments.length,5);
 assert.equal(new Set([...first.comments,...second.comments].map(row=>row.id)).size,25);
 for(const comment of [...first.comments,...second.comments]){
  assert.equal(comment.pageTitle,comment.page==='/'?'首页':'扑光');
  assert.equal(comment.actor,undefined);assert.equal(comment.network,undefined);
 }
 const fromOtherPage=await json(f.request('/api/public/page?page=/portfolio/puguang/'));
 assert.deepEqual(fromOtherPage.comments,first.comments);
 await f.admin({action:'settings',page:'/portfolio/puguang/',comments:false,likes:true,views:true});
 const enabledOnly=await json(f.request('/api/public/page?page=/portfolio/puguang/'));
 assert.equal(enabledOnly.globalCommentsCount,12);assert.equal(enabledOnly.commentsCount,0);
 assert.ok(enabledOnly.comments.every(row=>row.page==='/'));
 await f.admin({action:'settings',page:'/portfolio/puguang/',comments:true,likes:true,views:true});
 const reduced=createApp({pages:[{path:'/',title:'Renamed home'}],fetcher:f.fetcher,now:()=>f.clock.value});
 const response=await reduced.fetch(new Request('https://api.example.com/api/public/page?page=/',{headers:{'CF-Connecting-IP':'192.0.2.42'}}),f.env);
 const removed=await response.json();assert.equal(removed.globalCommentsCount,12);
 assert.ok(removed.comments.every(row=>row.page==='/'&&row.pageTitle==='Renamed home'));
});

test('public comment totals include only approved comments and respect page visibility', async () => {
 const f=await fixture();
 await f.request('/api/public/comment',f.payload());
 await f.request('/api/public/comment',f.payload());
 assert.equal((await json(f.request('/api/public/page?page=/'))).commentsCount,0);
 const comments=(await json(f.admin())).comments;
 await f.admin({action:'moderate',id:comments[0].id,status:'approved'});
 await f.admin({action:'moderate',id:comments[1].id,status:'rejected'});
 assert.equal((await json(f.request('/api/public/page?page=/'))).commentsCount,1);
 assert.equal((await json(f.request('/api/public/like',f.payload('like')))).commentsCount,1);
 await f.admin({action:'settings',page:'/',comments:false,likes:true,views:true});
 const hidden=await json(f.request('/api/public/page?page=/'));
 assert.equal(hidden.commentsCount,0);assert.deepEqual(hidden.comments,[]);
});

test('incremental dashboard migration preserves legacy data and does not invent daily views', () => {
 const db = new DatabaseSync(':memory:');
 db.exec(readFileSync(new URL('./migrations/0001.sql', import.meta.url), 'utf8'));
 db.exec("INSERT INTO pages(path,title,views) VALUES('/','Legacy',42); INSERT INTO likes VALUES('/','actor','network',1000); INSERT INTO view_keys VALUES('/','day-hash',1000)");
 db.exec(readFileSync(new URL('./migrations/0002_dashboard.sql', import.meta.url), 'utf8'));
 assert.equal(db.prepare('SELECT views FROM pages').get().views, 43);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM likes').get().n, 1);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM daily_views').get().n, 0);
 assert.equal(db.prepare('SELECT likes_adjustment FROM pages').get().likes_adjustment, 0);
 db.close();
});

test('manual totals are audited, public, preserve likes, reject stale edits and reset correctly', async () => {
 const f = await fixture();
 await f.request('/api/public/like', f.payload('like'));
 const change = { action:'edit_stats', page:'/', confirm:'/', views:100, likes:20, expectedViews:0, expectedLikes:1, reason:'修正测试' };
 assert.equal((await f.admin(change)).status, 200);
 let page = await json(f.request('/api/public/page?page=/'));
 assert.equal(page.views, 100); assert.equal(page.likes, 20);
 assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM likes').get().n, 1);
 assert.equal((await f.admin(change)).status, 409);
 assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='edit_stats'").get().n, 1);
 const entry = JSON.parse(f.DB.db.prepare("SELECT target FROM audit WHERE action='edit_stats'").get().target);
 assert.equal(entry.reason, change.reason); assert.equal(entry.before.likes, 1); assert.equal(entry.after.likes, 20);
 const row = f.DB.db.prepare('SELECT * FROM likes').get();
 const deletion = {action:'delete_like',page:'/',actor:row.actor,createdAt:row.created_at,confirm:'/'};
 assert.equal((await f.admin(deletion)).status, 200);
 assert.equal((await f.admin(deletion)).status, 200);
 page = await json(f.request('/api/public/page?page=/')); assert.equal(page.likes, 19);
 assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM audit WHERE action='delete_like'").get().n, 1);
 await f.admin({action:'reset',page:'/',metric:'likes',confirm:'/'});
 assert.equal((await json(f.request('/api/public/page?page=/'))).likes, 0);
});

test('concurrent counter edits have one winner and invalid edits cannot change totals', async () => {
 const f=await fixture(); await f.admin();
 const change={action:'edit_stats',page:'/',confirm:'/',views:10,likes:2,expectedViews:0,expectedLikes:0,reason:'test'};
 const responses=await Promise.all([f.admin(change),f.admin({...change,views:20})]);
 assert.deepEqual(responses.map(response=>response.status).sort(),[200,409]);
 for(const invalid of [{likes:-1},{views:1.5},{reason:''},{confirm:'bad'},{likes:1000000001}])assert.equal((await f.admin({...change,...invalid})).status,400);
 assert.equal((await f.request('/api/admin/dashboard')).status,401);
});

test('daily chart records deduplicated views and keeps history through count adjustments and cleanup', async () => {
 const f=await fixture();
 await Promise.all([f.request('/api/public/view',{page:'/',website:''}),f.request('/api/public/view',{page:'/',website:''})]);
 assert.equal(f.DB.db.prepare('SELECT SUM(views) n FROM daily_views').get().n,1);
 await f.admin({action:'edit_stats',page:'/',confirm:'/',views:50,likes:0,expectedViews:1,expectedLikes:0,reason:'test'});
 await f.admin({action:'reset',page:'/',metric:'views',confirm:'/'});
 f.clock.value+=3*86400000;await f.app.cleanup(f.env);
 assert.equal(f.DB.db.prepare('SELECT SUM(views) n FROM daily_views').get().n,1);
});

test('admin page and identity filters apply before pagination, and dashboard paginates likes', async () => {
 const f=await fixture();await f.admin();
 const actor='a'.repeat(64),network='b'.repeat(64);
 for(let index=0;index<55;index++){
  const id=index.toString(16).padStart(64,'0');
  f.DB.db.prepare('INSERT INTO likes VALUES(?,?,?,?)').run('/',id,null,f.clock.value);
 }
 f.DB.db.prepare('INSERT INTO likes VALUES(?,?,?,?)').run('/portfolio/puguang/',actor,network,f.clock.value);
 await f.request('/api/public/comment',f.payload('comment',{page:'/portfolio/puguang/'}));
 const get=route=>f.request(route,undefined,{headers:{'Cf-Access-Jwt-Assertion':f.adminToken}});
 const first=await json(get('/api/admin/dashboard'));
 const second=await json(get('/api/admin/dashboard?after='+encodeURIComponent(first.next)));
 assert.equal(first.likes.length,50);assert.equal(second.likes.length,6);
 assert.equal(new Set([...first.likes,...second.likes].map(row=>row.page+row.actor)).size,56);
 const scoped=await json(get('/api/admin/dashboard?network='+network));
 assert.equal(scoped.totals.likes,1);assert.equal(scoped.totals.visitors,1);
 assert.equal(scoped.likes[0].actor,actor);
 assert.equal((await json(get('/api/admin/data?page=/'))).comments.length,0);
 assert.equal((await json(get('/api/admin/data?page=/portfolio/puguang/'))).comments.length,1);
 assert.equal((await get('/api/admin/dashboard?actor=invalid')).status,400);
});
test('Secrets Store binding resolves the Turnstile secret for verification', async () => {
  const f = await fixture();
  f.env.TURNSTILE_SECRET_KEY = { get: async () => 'stored-test-secret' };
  const response = await f.request('/api/public/comment', f.payload());
  assert.equal(response.status, 202);
  const verification = f.calls.find(call => call.url.includes('siteverify'));
  assert.equal(new URLSearchParams(verification.init.body).get('secret'), 'stored-test-secret');
});
test('unavailable Secrets Store prevents submission without exposing its error', async () => {
  const f = await fixture();
  f.env.TURNSTILE_SECRET_KEY = { get: async () => { throw Error('private store details'); } };
  const response = await f.request('/api/public/comment', f.payload());
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'verification_unavailable');
  assert.equal(f.calls.length, 0);
  assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS count FROM comments').get().count, 0);
});
test('concurrent request ID conflicts cannot claim success or send different private messages',async()=>{
 for(const action of ['comment','contact']){
  const f=await fixture(),p=f.payload(action,{email:'visitor@example.com'});
  const route=action==='contact'?'/api/contact':'/api/public/comment';
  const responses=await Promise.all([f.request(route,p),f.request(route,{...p,body:'different content'})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[202,409]);
  const table=action==='contact'?'messages':'comments';
  assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM '+table).get().n,1);
  if(action==='contact')assert.equal(f.calls.filter(c=>c.url.includes('api.resend.com')).length,1);
 }
});
test('marking failed mail handled never turns provider rejection into accepted delivery',async()=>{
 const f=await fixture(),p=f.payload('contact',{email:'visitor@example.com'});f.scenario.mailStatus=403;
 assert.equal((await f.request('/api/contact',p)).status,502);
 const message=(await json(f.admin())).messages[0];
 await f.admin({action:'handle_message',id:message.id});
 assert.equal((await f.request('/api/contact',p)).status,502);
 const saved=(await json(f.admin())).messages[0];assert.equal(saved.state,'failed');assert.ok(saved.handled_at);
});
test('network ban covers private email and admin actions require the exact route',async()=>{
 const f=await fixture(),p=f.payload();await f.request('/api/public/comment',p);
 await f.admin({action:'ban_comment',id:(await json(f.admin())).comments[0].id});
 assert.equal((await f.request('/api/contact',f.payload('contact',{email:'visitor@example.com'}))).status,403);
 assert.equal((await f.request('/api/admin/unknown',{action:'reset',page:'/',metric:'views',confirm:'/'},{headers:{Origin:'https://api.example.com','Cf-Access-Jwt-Assertion':f.adminToken,'X-Admin-Action':'1'}})).status,404);
});
test('anonymous comment waits for moderation; approval, reply and rejection control public exposure',async()=>{const f=await fixture(),p=f.payload();assert.equal((await f.request('/api/public/comment',p)).status,202);let page=await json(f.request('/api/public/page?page=/'));assert.equal(page.comments.length,0);let admin=await json(f.admin());assert.equal(admin.comments.length,1);const id=admin.comments[0].id;await f.admin({action:'reply',id,reply:'谢谢 <script>bad()</script>'});await f.admin({action:'moderate',id,status:'approved'});page=await json(f.request('/api/public/page?page=/'));assert.equal(page.comments[0].body,p.body);assert.ok(page.comments[0].reply.includes('<script>'));assert.equal(page.comments[0].actor,undefined);assert.equal(page.comments[0].network,undefined);await f.admin({action:'moderate',id,status:'rejected'});assert.equal((await json(f.request('/api/public/page?page=/'))).comments.length,0);});
test('duplicate comment retries are idempotent; reused request ID with changed content conflicts',async()=>{const f=await fixture(),p=f.payload();await f.request('/api/public/comment',p);await f.request('/api/public/comment',p);assert.equal((await json(f.admin())).comments.length,1);assert.equal((await f.request('/api/public/comment',{...p,body:'changed'})).status,409);});
test('likes deduplicate same visitor and same monthly network; separate visitors on separate networks count',async()=>{const f=await fixture(),p=f.payload('like');await f.request('/api/public/like',p);await f.request('/api/public/like',p);await f.request('/api/public/like',f.payload('like'));assert.equal((await json(f.request('/api/public/page?page=/'))).likes,1);await f.request('/api/public/like',f.payload('like'),{headers:{Origin:'https://zhuqing.tech','Content-Type':'application/json','CF-Connecting-IP':'192.0.2.43'}});assert.equal((await json(f.request('/api/public/page?page=/'))).likes,2);});
test('daily views deduplicate atomically, change next day, and keep totals after expiry cleanup',async()=>{const f=await fixture(),p={page:'/',website:''};await f.request('/api/public/view',p);await f.request('/api/public/view',p);assert.equal((await json(f.request('/api/public/page?page=/'))).views,1);f.clock.value+=86400000;await f.request('/api/public/view',p);assert.equal((await json(f.request('/api/public/page?page=/'))).views,2);f.clock.value+=3*86400000;await f.app.cleanup(f.env);assert.equal(f.DB.db.prepare('SELECT COUNT(*) AS n FROM view_keys').get().n,0);assert.equal((await json(f.request('/api/public/page?page=/'))).views,2);});
test('unknown/private pages, malicious origins, malformed inputs, bots and long bodies fail',async()=>{const f=await fixture();assert.equal((await f.request('/api/public/page?page=/private/')).status,404);for(const data of [f.payload('comment',{body:''}),f.payload('comment',{body:'x'.repeat(2001)}),f.payload('comment',{website:'spam'}),f.payload('comment',{visitor:'fake'}),f.payload('comment',{body:'https://a https://b https://c'}),null])assert.equal((await f.request('/api/public/comment',data)).status,400);assert.equal((await f.request('/api/public/comment','{bad')).status,400);const req=new Request('https://api.example.com/api/public/comment',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:'中'.repeat(6000)})});await assert.rejects(()=>readJSON(req),e=>e.status===413);const bad=f.payload();assert.equal((await f.request('/api/public/comment',bad,{headers:{Origin:'https://zhuqing.tech.evil','CF-Connecting-IP':'192.0.2.42','Content-Type':'application/json'}})).status,403);});
test('Turnstile failure, hostname mismatch and wrong action prevent interactions',async()=>{const f=await fixture();f.scenario.challenge=false;assert.equal((await f.request('/api/public/like',f.payload('like'))).status,400);f.scenario.challenge=true;f.scenario.host='evil.example';assert.equal((await f.request('/api/public/comment',f.payload())).status,400);f.scenario.host='zhuqing.tech';assert.equal((await f.request('/api/public/like',f.payload('contact'))).status,400);assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM likes').get().n,0);});
test('native and exact SQL quotas prevent abuse across requests',async()=>{const f=await fixture();for(let i=0;i<3;i++)assert.equal((await f.request('/api/public/comment',f.payload())).status,202);assert.equal((await f.request('/api/public/comment',f.payload())).status,429);f.env.PUBLIC_LIMITER.limit=async()=>({success:false});assert.equal((await f.request('/api/public/page?page=/')).status,429);f.env.PUBLIC_LIMITER.limit=async()=>({success:true});f.env.GLOBAL_LIMITER.limit=async()=>({success:false});assert.equal((await f.request('/api/public/view',{page:'/',website:''})).status,429);});
test('admin requires verified JWT and exact allowed email, issuer, audience and expiry',async()=>{const f=await fixture();assert.equal((await f.request('/api/admin/data')).status,401);for(const claims of [{email:'intruder@example.com'},{exp:1},{aud:['wrong']},{iss:'https://wrong.cloudflareaccess.com'},{nbf:Math.floor(Date.now()/1000)+600}]){const token=await jwt(claims);const res=await f.request('/api/admin/data',undefined,{headers:{'Cf-Access-Jwt-Assertion':token}});assert.ok([401,403].includes(res.status));}const none=await jwt({},{alg:'none'});assert.equal((await f.request('/api/admin/data',undefined,{headers:{'Cf-Access-Jwt-Assertion':none}})).status,401);let token=await jwt();token=token.slice(0,-8)+'tampered';assert.equal((await f.request('/api/admin/data',undefined,{headers:{'Cf-Access-Jwt-Assertion':token}})).status,401);assert.equal((await f.admin()).status,200);});
test('admin CSRF and invalid actions fail; settings and audited reset operate only on registered pages',async()=>{const f=await fixture();await f.request('/api/public/view',{page:'/',website:''});assert.equal((await f.admin({action:'reset',page:'/',metric:'views',confirm:'/'},{headers:{Origin:'https://evil.example','Cf-Access-Jwt-Assertion':f.adminToken,'X-Admin-Action':'1'}})).status,403);assert.equal((await f.admin({action:'reset',page:'/',metric:'views',confirm:'wrong'})).status,400);await f.admin({action:'settings',page:'/',comments:false,likes:false,views:false});assert.equal((await f.request('/api/public/comment',f.payload())).status,403);assert.equal((await f.request('/api/public/like',f.payload('like'))).status,403);assert.equal((await f.request('/api/public/view',{page:'/',website:''})).status,403);await f.admin({action:'reset',page:'/',metric:'views',confirm:'/'});const data=await json(f.admin());assert.equal(data.pages[0].views,0);assert.ok(data.audit.some(a=>a.action==='reset:views'));});
test('administrator can ban/unban anonymous visitor and delete comments',async()=>{const f=await fixture(),p=f.payload();await f.request('/api/public/comment',p);let data=await json(f.admin());const id=data.comments[0].id;await f.admin({action:'ban_comment',id});assert.equal((await f.request('/api/public/like',{...p,token:'like-token'})).status,403);data=await json(f.admin());for(const b of data.bans)await f.admin({action:'unban',kind:b.kind,value:b.value});assert.equal((await f.request('/api/public/like',{...p,token:'like-token'})).status,200);await f.admin({action:'delete_comment',id});assert.equal((await json(f.admin())).comments.length,0);});
test('contact uses fixed recipient and verified reply-to, acceptance is idempotent and private',async()=>{const f=await fixture(),p=f.payload('contact',{email:'visitor@example.com',to:'attacker@example.com'});assert.equal((await f.request('/api/contact',p)).status,202);assert.equal((await f.request('/api/contact',p)).status,202);const mails=f.calls.filter(c=>c.url.includes('api.resend.com'));assert.equal(mails.length,1);const sent=JSON.parse(mails[0].init.body);assert.deepEqual(sent.to,['zq_eugene@qq.com']);assert.equal(sent.reply_to,p.email);assert.equal(sent.from,'contact@example.com');assert.equal(sent.html,undefined);assert.equal(JSON.stringify(await json(f.request('/api/public/page?page=/'))).includes(p.email),false);let data=await json(f.admin());assert.equal(data.messages.length,1);await f.admin({action:'handle_message',id:data.messages[0].id});data=await json(f.admin());assert.equal(data.messages[0].state,'accepted');assert.ok(data.messages[0].handled_at);await f.admin({action:'delete_message',id:data.messages[0].id});assert.equal((await json(f.admin())).messages.length,0);});
test('provider rejection/timeouts never claim acceptance; uncertain retry reuses provider key',async()=>{const f=await fixture(),p=f.payload('contact',{email:'visitor@example.com'});f.scenario.throwMail=true;assert.equal((await f.request('/api/contact',p)).status,503);assert.equal((await json(f.admin())).messages[0].state,'unknown');f.scenario.throwMail=false;assert.equal((await f.request('/api/contact',p)).status,202);const calls=f.calls.filter(c=>c.url.includes('api.resend.com'));assert.equal(calls[0].init.headers['Idempotency-Key'],calls[1].init.headers['Idempotency-Key']);const g=await fixture();g.scenario.mailStatus=403;assert.equal((await g.request('/api/contact',g.payload('contact',{email:'visitor@example.com'}))).status,502);});
test('missing protection, database, mail or administrator configuration fails closed',async()=>{for(const key of ['DB','ABUSE_SECRET','PUBLIC_LIMITER','GLOBAL_LIMITER']){const f=await fixture();delete f.env[key];assert.equal((await f.request('/api/public/like',f.payload('like'))).status,503);}for(const key of ['TURNSTILE_SECRET_KEY','RESEND_API_KEY','MAIL_FROM']){const f=await fixture();delete f.env[key];assert.equal((await f.request('/api/contact',f.payload('contact',{email:'visitor@example.com'}))).status,503);}const f=await fixture();delete f.env.ACCESS_AUD;assert.equal((await f.admin()).status,503);});
test('retention purges expired private messages, unapproved comments and audit but preserves published comments',async()=>{const f=await fixture();await f.request('/api/public/comment',f.payload());await f.request('/api/public/comment',f.payload());let rows=(await json(f.admin())).comments;await f.admin({action:'moderate',id:rows[0].id,status:'approved'});await f.request('/api/contact',f.payload('contact',{email:'visitor@example.com'}));f.clock.value+=91*86400000;await f.app.cleanup(f.env);assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM messages').get().n,0);assert.equal(f.DB.db.prepare('SELECT COUNT(*) n FROM audit').get().n,0);rows=f.DB.db.prepare('SELECT * FROM comments').all();assert.equal(rows.length,1);assert.equal(rows[0].status,'approved');});
test('database never stores raw IP, browser visitor ID or secret; admin HTML has restrictive CSP',async()=>{const f=await fixture(),p=f.payload();await f.request('/api/public/comment',p);await f.request('/api/public/like',{...p,token:'like-token'});const stored=['comments','likes','view_keys','quotas','bans'].map(t=>f.DB.db.prepare('SELECT * FROM '+t).all());const dump=JSON.stringify(stored);assert.ok(!dump.includes('192.0.2.42'));assert.ok(!dump.includes(p.visitor));assert.ok(!dump.includes(f.env.ABUSE_SECRET));const res=await f.request('/admin',undefined,{headers:{'Cf-Access-Jwt-Assertion':f.adminToken}});assert.equal(res.status,200);assert.ok(res.headers.get('Content-Security-Policy').includes("frame-ancestors 'none'"));assert.ok(!(await res.text()).includes('test-secret'));});
test('pagination does not lose comments with equal timestamps and rejects crafted cursors',async()=>{const f=await fixture();await f.request('/api/public/page?page=/');for(let i=0;i<25;i++)f.DB.db.prepare("INSERT INTO comments(id,page,nickname,body,status,actor,network,request_id,payload_hash,created_at,updated_at) VALUES(?,'/','访客',?,'approved','hash','hash',?,'hash',?,?)").run(crypto.randomUUID(),'comment '+i,crypto.randomUUID(),f.clock.value,f.clock.value);const first=await json(f.request('/api/public/page?page=/'));assert.equal(first.comments.length,20);const second=await json(f.request('/api/public/page?page=/&before='+encodeURIComponent(first.nextBefore)));assert.equal(second.comments.length,5);assert.equal(new Set([...first.comments,...second.comments].map(c=>c.id)).size,25);assert.equal((await f.request('/api/public/page?page=/&before=1%20OR%201=1')).status,400);});
test('invalid verification cannot spend the global mail budget; retries beyond provider window fail closed',async()=>{const f=await fixture(),p=f.payload('contact',{email:'visitor@example.com'});f.scenario.challenge=false;await f.request('/api/contact',p);assert.equal(f.DB.db.prepare("SELECT COUNT(*) n FROM quotas WHERE key LIKE 'global-mail:%'").get().n,0);f.scenario.challenge=true;f.scenario.throwMail=true;await f.request('/api/contact',p);f.clock.value+=24*3600000;assert.equal((await f.request('/api/contact',p)).status,409);});
