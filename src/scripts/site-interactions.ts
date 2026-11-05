import { withBase } from '../lib/paths';
type Widget={resolve?:(s:string)=>void;reject?:(e:Error)=>void;id?:string;timer?:ReturnType<typeof setTimeout>};
declare global{interface Window{turnstile?:{render:(n:HTMLElement,o:Record<string,unknown>)=>string;reset:(id:string)=>void}}}
let loader:Promise<void>|undefined;const widgets=new WeakMap<HTMLElement,Widget>();
const language=()=>document.documentElement.dataset.language==='en';
function notify(node:HTMLElement,cn:string,en:string){node.dataset.i18nCn=cn;node.dataset.i18nEn=en;node.textContent=language()?en:cn;}
function apiRoot(raw:string|undefined){try{const u=new URL(raw||'');if(u.protocol==='https:'||(import.meta.env.DEV&&u.protocol==='http:'&&['localhost','127.0.0.1'].includes(u.hostname)))return u.origin;}catch{}return '';}
async function post(api:string,path:string,data:unknown){const res=await fetch(api+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data),credentials:'omit',signal:AbortSignal.timeout(25000)});const v=await res.json();if(!res.ok||!v.ok)throw Error(v.code||'unavailable');return v;}
function visitor(){let id;try{id=localStorage.getItem('zq-anonymous-visitor');if(!id){id=crypto.randomUUID();localStorage.setItem('zq-anonymous-visitor',id);}}catch{throw Error('storage_required');}return id;}
function loadVerification(){if(window.turnstile)return Promise.resolve();return loader??=new Promise<void>((resolve,reject)=>{const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;const timer=setTimeout(()=>{loader=undefined;s.remove();reject(Error('verification_unavailable'));},15000);s.onload=()=>{clearTimeout(timer);window.turnstile?resolve():reject(Error('verification_unavailable'));};s.onerror=()=>{clearTimeout(timer);loader=undefined;s.remove();reject(Error('verification_unavailable'));};document.head.append(s);});}
async function verify(container:HTMLElement,key:string,action:string){
 await loadVerification();
 const dialog=container.closest('dialog');
 if(dialog&&!dialog.open)throw Error('verification_cancelled');
 let state=widgets.get(container);
 if(!state){state={};widgets.set(container,state);}
 const current=state;
 return new Promise<string>((resolve,reject)=>{
  current.resolve=resolve;current.reject=reject;
  current.timer=setTimeout(()=>reject(Error('verification_required')),180000);
  const success=(token:string)=>{clearTimeout(current.timer);current.resolve?.(token);};
  const fail=()=>{clearTimeout(current.timer);current.reject?.(Error('verification_failed'));};
  if(current.id!==undefined)window.turnstile!.reset(current.id);
  else current.id=window.turnstile!.render(container,{
   sitekey:key,action,theme:'auto',appearance:'interaction-only',
   callback:success,'expired-callback':fail,'error-callback':fail,
  });
 });
}
function errorText(status:HTMLElement,error:unknown){
 const code=error instanceof Error?error.message:'';
 status.dataset.errorCode=code;
 if(code==='verification_cancelled'){status.textContent='';return;}
 const messages:Record<string,[string,string]>={
  rate_limited:['操作频繁，请稍后重试','Too many requests. Try later'],
  blocked:['暂时无法提交','Submissions restricted'],
  storage_required:['请允许浏览器存储','Allow browser storage to continue'],
  invalid_email:['请检查邮箱地址','Check your email address'],
  invalid_input:['请检查填写内容','Check the form fields'],
  forbidden:['请从正式网站提交','Submit from the official website'],
  mail_unconfigured:['邮件暂不可用','Email unavailable'],
  mail_failed:['邮件发送失败，请重试','Email failed. Retry'],
  request_conflict:['内容已变更，请重新提交','Content changed. Submit again'],
 };
 if(messages[code])notify(status,...messages[code]);
 else if(code.endsWith('_disabled'))notify(status,'暂未开放','Currently unavailable');
 else if(code.startsWith('verification'))notify(status,'验证失败，请重试','Verification failed. Retry');
 else notify(status,'暂未确认，请重试','Unconfirmed. Please retry');
}

document.querySelectorAll<HTMLElement>('[data-site-interactions]').forEach(root=>{
 const api=apiRoot(root.dataset.api),key=root.dataset.siteKey||'',page=root.dataset.page!,status=root.querySelector<HTMLElement>('[data-interaction-status]')!,like=root.querySelector<HTMLButtonElement>('[data-like]')!,more=root.querySelector<HTMLButtonElement>('[data-more-comments]')!;
 const conversation=root.querySelector<HTMLDialogElement>('dialog[data-conversation-panel]');
 const likeDialog=root.querySelector<HTMLDialogElement>('dialog[data-like-panel]');
 const selectContactMode=(mode:string)=>{
  root.querySelector<HTMLElement>('[data-public-message]')!.hidden=mode==='email';
  const formal=root.querySelector<HTMLElement>('[data-formal-message]');if(formal)formal.hidden=mode!=='email';
  root.querySelectorAll<HTMLButtonElement>('[data-contact-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.contactMode===mode)));
 };
 if(conversation){
  document.querySelectorAll<HTMLButtonElement>('[data-message-open]').forEach(opener=>{
   opener.setAttribute('aria-haspopup','dialog');
   opener.addEventListener('click',()=>{selectContactMode(opener.dataset.contactIntent||'public');conversation.showModal();});
  });
  root.querySelectorAll<HTMLButtonElement>('[data-contact-mode]').forEach(button=>button.onclick=()=>selectContactMode(button.dataset.contactMode!));
  if(location.hash==='#site-interactions')conversation.showModal();
 }
 root.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog=>{
  dialog.querySelector<HTMLButtonElement>('[data-panel-close]')?.addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',event=>{
   const bounds=dialog.getBoundingClientRect();
   if(event.target===dialog&&(event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom))dialog.close();
  });
  dialog.addEventListener('close',()=>{
   dialog.querySelectorAll<HTMLElement>('[data-challenge],[data-like-challenge],[data-delete-challenge]').forEach(container=>{
    const pending=widgets.get(container);clearTimeout(pending?.timer);pending?.reject?.(Error('verification_cancelled'));
   });
  });
 });
 const commentForm=root.querySelector<HTMLFormElement>('[data-comment-form]')!;
 const commentInput=root.querySelector<HTMLTextAreaElement>('[data-comment-form] textarea[name="body"]')!;
 const clearReply=()=>{
  delete commentForm.dataset.replyToId;delete commentForm.dataset.replyPage;
  root.querySelector<HTMLElement>('[data-reply-context]')!.hidden=true;
 };
 root.querySelector('[data-reply-cancel]')?.addEventListener('click',clearReply);
 commentForm.addEventListener('reset',clearReply);
 root.querySelector('[data-comment-focus]')?.addEventListener('click',()=>commentInput.focus());
 root.querySelectorAll<HTMLButtonElement>('[data-emoticon]').forEach(button=>button.addEventListener('click',()=>{
  if(commentInput.readOnly)return;
  const face=button.dataset.emoticon!;
  if(commentInput.value.length-(commentInput.selectionEnd-commentInput.selectionStart)+face.length>commentInput.maxLength)return;
  commentInput.setRangeText(face,commentInput.selectionStart,commentInput.selectionEnd,'end');
  commentInput.dispatchEvent(new Event('input',{bubbles:true}));
  button.closest('details')?.removeAttribute('open');commentInput.focus();
 }));
 if(!api)return;
 const confirmation=root.querySelector<HTMLDialogElement>('[data-email-confirmation]');
 const openEmailConfirmation=()=>{
  if(!confirmation||!location.hash.startsWith('#comment-email='))return;
  const emailToken=location.hash.slice('#comment-email='.length);
  history.replaceState(null,'',location.pathname+location.search);
  const unsubscribe=emailToken.startsWith('unsubscribe.');
  root.querySelector('[data-email-heading]')!.textContent=unsubscribe?'关闭回复提醒？':'开启回复提醒？';
  const confirmButton=root.querySelector<HTMLButtonElement>('[data-email-confirm]')!;
  confirmButton.disabled=false;
  root.querySelector('[data-email-result]')!.textContent='';
  conversation?.close();
  confirmation.showModal();
  confirmButton.onclick=async()=>{
   confirmButton.disabled=true;
   try{const result=await post(api,'/api/public/comment-email',{emailToken,website:''});root.querySelector('[data-email-result]')!.textContent=result.code==='subscribed'?'已开启':'已退订';}
   catch{root.querySelector('[data-email-result]')!.textContent='链接失效或暂不可用';confirmButton.disabled=false;}
  };
 };
 openEmailConfirmation();
 if(confirmation)window.addEventListener('hashchange',openEmailConfirmation);
 const myPanel=root.querySelector<HTMLDetailsElement>('[data-my-comments]')!;
 const myList=root.querySelector<HTMLElement>('[data-my-list]')!;
 const myMore=root.querySelector<HTMLButtonElement>('[data-my-more]')!;
 let mineLoaded=false,mineBusy=false,mineCursor:string|null=null;
 async function loadMine(append=false){
  if(mineBusy)return;mineBusy=true;myMore.disabled=true;
  try{
   const data=await post(api,'/api/public/my-comments',{visitor:visitor(),website:'',...(append&&mineCursor?{before:mineCursor}:{})});
   if(!append)myList.replaceChildren();
   for(const comment of data.comments){
    const card=document.createElement('article'),meta=document.createElement('p'),body=document.createElement('p'),remove=document.createElement('button'),challenge=document.createElement('div');
    const statusLabels:Record<string,string>={pending:'待审核',approved:'已公开',rejected:'未通过'};
    meta.textContent=comment.pageTitle+' · '+statusLabels[comment.status];body.textContent=comment.body;
    remove.type='button';notify(remove,'删除','Delete');challenge.dataset.deleteChallenge='';
    remove.onclick=async()=>{
     if(!confirm(language()?'Delete this comment?':'删除这条留言？'))return;
     remove.disabled=true;
     try{const token=await verify(challenge,key,'delete_comment');await post(api,'/api/public/delete-comment',{id:comment.id,visitor:visitor(),token,website:''});card.remove();await load();}
     catch(error){errorText(meta,error);}finally{remove.disabled=false;}
    };
    card.append(meta,body,remove,challenge);myList.append(card);
   }
   if(!myList.children.length){const empty=document.createElement('p');notify(empty,'暂无留言','No comments yet');myList.append(empty);}
   mineCursor=data.nextBefore;myMore.hidden=!mineCursor;mineLoaded=true;
  }catch(error){errorText(status,error);}finally{mineBusy=false;myMore.disabled=false;}
 }
 myPanel.addEventListener('toggle',()=>{if(myPanel.open&&!mineLoaded)void loadMine();});myMore.onclick=()=>void loadMine(true);
 commentForm.addEventListener('comment-saved',()=>{mineLoaded=false;if(myPanel.open)void loadMine();});
 let next:string|null=null,liked=false;
 function counts(v:any){root.querySelector('[data-views]')!.textContent=Number(v.views).toLocaleString();root.querySelector('[data-likes]')!.textContent=Number(v.likes).toLocaleString();like.disabled=liked||!v.likesEnabled||!key;like.setAttribute('aria-pressed',String(liked));if(v.globalCommentsCount!==undefined||v.commentsCount!==undefined)root.querySelector('[data-comments]')!.textContent=Number(v.globalCommentsCount??v.commentsCount).toLocaleString();}
 function renderComment(c:any):HTMLLIElement {
 const li=document.createElement('li'),avatar=document.createElement('span'),content=document.createElement('div'),meta=document.createElement('div'),name=document.createElement('strong'),date=document.createElement('time'),body=document.createElement('p');
 avatar.className='comment-avatar';avatar.setAttribute('aria-hidden','true');avatar.textContent=Array.from(c.nickname.trim())[0]||'·';
 content.className='comment-content';meta.className='comment-meta';name.textContent=c.deleted_at?(language()?'Deleted comment':'已删除的评论'):c.nickname;
 date.dateTime=new Date(c.created_at).toISOString();date.textContent=new Date(c.created_at).toLocaleDateString();body.textContent=c.deleted_at?(language()?'Comment deleted':'评论已删除'):c.body;
 meta.append(name,date);content.append(meta);
 const source=document.createElement('div'),sourceLabel=document.createElement('span'),sourceLink=document.createElement('a');
 source.className='comment-source';sourceLabel.dataset.i18nCn='来自';sourceLabel.dataset.i18nEn='From';sourceLabel.textContent=language()?'From':'来自';
 const sourcePage=typeof c.page==='string'?c.page:page;
 // Only same-site absolute paths become navigation links.
 if(sourcePage.startsWith('/')&&!sourcePage.startsWith('//')&&!/[\\?#\x00-\x1f]/.test(sourcePage)){
  sourceLink.href=withBase(sourcePage)+'#site-interactions';sourceLink.textContent=c.pageTitle||root.dataset.pageTitle||sourcePage;
  sourceLink.addEventListener('click',event=>{
   if(sourcePage===page){event.preventDefault();if(conversation){if(!conversation.open)conversation.showModal();}else root.scrollIntoView({block:'start'});}
  });
  source.append(sourceLabel,sourceLink);
 }else source.append(sourceLabel,document.createTextNode(c.pageTitle||sourcePage));
 content.append(source,body);
 if(c.reply){const reply=document.createElement('p'),label=document.createElement('span');reply.className='admin-reply';label.className='reply-label';label.dataset.i18nCn='祝庆 · 作者';label.dataset.i18nEn='Zhu Qing · Author';label.textContent=language()?'Zhu Qing · Author':'祝庆 · 作者';reply.append(label,document.createTextNode(c.reply));content.append(reply);}
 if(c.replyToName){
  const target=document.createElement('p');target.className='reply-target';
  target.textContent=(language()?'Reply to ':'回复 ')+c.replyToName;content.insertBefore(target,body);
 }
 const actions=document.createElement('div');actions.className='comment-actions';
 const replyButton=document.createElement('button');replyButton.type='button';
 notify(replyButton,'回复','Reply');
 replyButton.onclick=()=>{
  if(commentInput.readOnly)return;
  commentForm.dataset.replyToId=c.id;commentForm.dataset.replyPage=c.page;
  const context=root.querySelector<HTMLElement>('[data-reply-context]')!;context.hidden=false;
  root.querySelector<HTMLElement>('[data-reply-label]')!.textContent=(language()?'Reply to ':'回复 ')+c.nickname+' · '+c.pageTitle;
  commentInput.focus();commentForm.scrollIntoView({block:'center',behavior:'smooth'});
 };
 if(!c.deleted_at)actions.append(replyButton);content.append(actions);
 if(!c.parent_id&&c.replyCount>0){
  const replies=document.createElement('ol');replies.className='comment-replies';replies.hidden=true;
  const expand=document.createElement('button');expand.type='button';
  notify(expand,'查看 '+c.replyCount+' 条回复','View '+c.replyCount+' replies');actions.append(expand);
  let replyCursor:string|null=null;
  expand.onclick=async()=>{
   expand.disabled=true;
   try{
    const params=new URLSearchParams({page:c.page,parent:c.id});if(replyCursor)params.set('before',replyCursor);
    const response=await fetch(api+'/api/public/replies?'+params,{credentials:'omit',signal:AbortSignal.timeout(12000)});
    const data=await response.json();if(!response.ok||!data.ok)throw Error(data.code);
    for(const reply of data.comments)replies.append(renderComment(reply));
    replies.hidden=false;replyCursor=data.nextBefore;expand.hidden=!replyCursor;
    notify(expand,'查看更多回复','More replies');
   }catch(error){notify(expand,'点击重试','Loading failed. Retry');}finally{expand.disabled=false;}
  };
  content.append(replies);
 }
 li.append(avatar,content);return li;
 }
 async function load(append=false){try{const response=await fetch(api+'/api/public/page?page='+encodeURIComponent(page)+(append&&next?'&before='+encodeURIComponent(next):''),{credentials:'omit',signal:AbortSignal.timeout(12000)});const v=await response.json();if(!response.ok||!v.ok)throw Error(v.code);counts(v);const list=root.querySelector('[data-comment-list]')!;if(!append)list.replaceChildren();for(const c of v.comments)list.append(renderComment(c));
 root.querySelector<HTMLElement>('[data-comment-empty]')!.hidden=!!list.children.length;
 if(v.globalCommentsCount===undefined&&v.commentsCount===undefined)root.querySelector('[data-comments]')!.textContent=String(v.comments.length);
 next=v.nextBefore;more.hidden=!next;root.querySelector<HTMLButtonElement>('[data-comment-form] button[type="submit"]')!.disabled=!v.commentsEnabled||!key;}catch(e){errorText(status,e);}}
 void load();more.onclick=()=>{more.disabled=true;void load(true).finally(()=>more.disabled=false);};
 like.onclick=async()=>{if(like.disabled)return;like.disabled=true;likeDialog?.showModal();notify(status,'处理中…','Processing…');try{const id=visitor(),token=await verify(root.querySelector('[data-like-challenge]')!,key,'like');if(likeDialog&&!likeDialog.open)throw Error('verification_cancelled');const v=await post(api,'/api/public/like',{page,visitor:id,token,website:''});liked=true;counts(v);notify(status,'已点赞','Liked');likeDialog?.close();}catch(e){if(!(e instanceof Error&&e.message==='verification_cancelled'))errorText(status,e);like.disabled=false;}};
 let viewTimer:ReturnType<typeof setTimeout>|undefined;let recorded=false;
 const viewKey='zq-view:'+new Date().toISOString().slice(0,10)+':'+page;
 try{recorded=sessionStorage.getItem(viewKey)==='1';}catch{}
 const record=()=>{if(document.visibilityState!=='visible'||recorded||viewTimer)return;viewTimer=setTimeout(()=>{viewTimer=undefined;if(document.visibilityState==='visible'&&!recorded){recorded=true;void post(api,'/api/public/view',{page,website:''}).then(result=>{counts(result);try{sessionStorage.setItem(viewKey,'1');}catch{}}).catch(()=>{});}},8000);};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState!=='visible'){clearTimeout(viewTimer);viewTimer=undefined;}else record();});window.addEventListener('pagehide',()=>clearTimeout(viewTimer),{once:true});record();
 const form=root.querySelector<HTMLFormElement>('[data-comment-form]')!;wireForm(form,api,key,'comment',page);
});
function wireForm(form:HTMLFormElement,api:string,key:string,action:'comment'|'contact',page?:string){
 let busy=false,last='',requestId='';const status=form.querySelector<HTMLElement>('[data-form-status]')!,button=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
 if(!api||!key){button.disabled=true;return;}
 form.addEventListener('submit',async event=>{event.preventDefault();if(busy||!form.reportValidity()||button.disabled)return;const d=new FormData(form),body=String(d.get('body')||'').trim();if(!body)return;let payload:any;try{payload=action==='comment'?{page:form.dataset.replyPage||page,nickname:String(d.get('nickname')||'').trim(),body,visitor:visitor(),email:String(d.get('email')||'').trim(),...(form.dataset.replyToId?{replyToId:form.dataset.replyToId}:{})}:{email:String(d.get('email')||'').trim(),body};}catch(e){errorText(status,e);return;}const signature=JSON.stringify(payload);if(signature!==last){requestId=crypto.randomUUID();last=signature;}busy=true;button.disabled=true;form.setAttribute('aria-busy','true');form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(n=>n.readOnly=true);notify(status,'处理中…','Processing…');
 try{const token=await verify(form.querySelector('[data-challenge]')!,key,action);const v=await post(api,action==='contact'?'/api/contact':'/api/public/comment',{...payload,token,requestId,website:String(d.get('website')||'')});if(action==='contact'&&v.code==='accepted')notify(status,'已提交','Submitted');else if(action==='comment'&&v.code==='pending_review'){
    const notices:Record<string,string>={verification_sent:' 请验证邮箱。',enabled:'',unavailable:' 提醒暂不可用。'};
    notify(status,'已提交，待审核。'+(notices[v.notification]||''),'Pending review.'+(v.notification==='verification_sent'?' Verify your email.':v.notification==='unavailable'?' Notifications unavailable.':''));
    form.dispatchEvent(new Event('comment-saved'));
   }else throw Error('unconfirmed');form.reset();last='';requestId='';}
 catch(e){errorText(status,e);}finally{busy=false;button.disabled=false;form.removeAttribute('aria-busy');form.querySelectorAll<HTMLInputElement|HTMLTextAreaElement>('input,textarea').forEach(n=>n.readOnly=false);status.focus();}
 });
}
document.querySelectorAll<HTMLElement>('[data-private-contact]').forEach(root=>wireForm(root.querySelector('form')!,apiRoot(root.dataset.api),root.dataset.siteKey||'','contact'));
