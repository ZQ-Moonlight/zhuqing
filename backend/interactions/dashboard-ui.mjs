export const dashboardCSS = String.raw`
:root{background:#101719;color:#e4edef;font-family:'Segoe UI',system-ui,sans-serif}
header,main{max-width:1500px;padding:28px 40px}header{border-color:#304348}
main{display:grid;grid-template-columns:185px minmax(0,1fr);gap:20px 32px}
#status,.metrics,.scope,main>footer,main>noscript{grid-column:1/-1}
nav{grid-column:1;grid-row:4;display:flex;flex-direction:column;align-self:start;margin:0;position:sticky;top:65px}
nav button{text-align:left;padding:13px 16px;border-color:transparent;background:transparent}
nav button[aria-pressed=true]{background:#b7ded4;color:#102c27}
main>section{grid-column:2;grid-row:4;min-width:0}h2{margin-top:0}
.metric,.card{background:#182326;border-color:#304348}.metrics{gap:20px}.metric{margin:0;padding:22px 26px}
.metric strong{font-size:38px;font-weight:600;letter-spacing:-1px}.metric:first-child{border-top:3px solid #9fd9c9}
.scope{display:flex;flex-wrap:wrap;gap:12px;align-items:end;padding:18px;background:#182326;border:1px solid #304348;border-radius:12px}
.scope label{display:grid;gap:7px;font-size:13px;color:#afc7c9}.scope select{max-width:320px}.scope input{width:210px}
button,select,input,textarea{background:#1b2b2e;border-color:#456067}.primary{background:#b7ded4;color:#102c27}
#status{background:#101719}.chart-grid{display:grid;grid-template-columns:1fr;gap:16px}.chart-card{margin:0}.chart-card h3{display:flex;justify-content:space-between}
.chart-card svg{width:100%;height:180px;display:block;overflow:visible}.chart-axis{display:flex;justify-content:space-between;color:#afc7c9;font-size:12px}
.table-wrap{overflow:auto;border:1px solid #304348;border-radius:12px}table{width:100%;min-width:700px;border-collapse:collapse;font-size:14px}th,td{padding:14px 16px;text-align:left;border-bottom:1px solid #304348;vertical-align:top}th{color:#afc7c9;background:#182326}td small{display:block;margin-top:7px;color:#afc7c9}td button{margin:2px;font-size:13px}
.stats-form{display:flex;flex-wrap:wrap;gap:12px;margin:18px 0}.stats-form label{display:grid;gap:6px;font-size:13px}.stats-form input{width:150px}.stats-form .reason{width:260px}
.identity-button{font-family:monospace;font-size:12px}.page-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:18px}.page-grid .card{margin:0}
.note{font-size:13px;color:#afc7c9;line-height:1.7}.chart-detail{margin-top:12px}.chart-detail table{font-size:12px;min-width:0}
@media(min-width:1200px){.chart-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.chart-card{padding:18px}}
@media(max-width:800px){header,main{padding:18px}main{display:flex;flex-direction:column;gap:0}#status{order:0}.metrics{order:1}.scope{order:2}nav{order:3}main>section{order:4}main>footer,main>noscript{order:5}nav{position:static;flex-direction:row;flex-wrap:wrap;margin:20px 0}nav button{padding:10px}.scope{margin-top:18px}.metrics{gap:8px}.metric{padding:12px}.metric strong{font-size:27px}.scope input,.scope select{max-width:100%;width:100%}.scope label{flex:1 1 180px}.page-grid{grid-template-columns:1fr}}
`;

export const dashboardHTML = String.raw`
<div class="scope" aria-label="页面与访客筛选">
 <label>页面 / 模块<select id="page-filter"><option value="">全部页面</option></select></label>
 <label>匿名访客标识<input id="actor-filter" placeholder="完整标识或点击记录筛选" maxlength="64"></label>
 <label>网络分组<input id="network-filter" placeholder="完整网络摘要" maxlength="64"></label>
 <button id="apply-scope" class="primary">应用筛选</button><button id="clear-scope">清除</button>
</div>
<section id="overview"><h2>互动概览</h2><p class="note">最近 30 天 · UTC 日期。浏览趋势按页面筛选；点赞、评论同时按访客和网络筛选。点击曲线上的点或展开明细查看数值。</p><div id="trend-charts" class="chart-grid"></div><p id="tracking-note" class="note"></p><h2 style="margin-top:30px">页面表现</h2><div class="table-wrap"><table><thead><tr><th>页面</th><th>展示浏览</th><th>展示点赞</th><th>访客点赞记录</th><th>评论</th><th>管理</th></tr></thead><tbody id="page-summary"></tbody></table></div></section>
<section id="visitors" hidden><h2>访客与点赞</h2><p id="visitor-totals"></p><p class="note">匿名标识对应浏览器，网络分组使用每月轮换的 IP 摘要。同一网络可能有多位访客，点赞网络摘要保留约 31 天。点击标识可查看其点赞和评论。</p><div class="table-wrap"><table><thead><tr><th>页面</th><th>匿名访客</th><th>网络分组</th><th>时间</th><th>操作</th></tr></thead><tbody id="like-list"></tbody></table></div><button id="more-likes" class="load-more" hidden>载入更多点赞</button></section>
`;

export const dashboardJS = String.raw`
let dashboardState = {};
function scopeParams() {
 const params = new URLSearchParams();
 for (const key of ['page','actor','network']) {
  const value = $('#'+key+'-filter').value.trim();
  if (value) params.set(key,value);
 }
 return params;
}
function selectTab(name) {
 active = name;
 document.querySelectorAll('[data-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.tab===name)));
 document.querySelectorAll('main>section').forEach(section=>section.hidden=section.id!==name);
}
function identityButton(kind, value) {
 if (!value) return el('span','已过保留期');
 const button = btn(value.slice(0,12)+'…', async()=>{
  $('#actor-filter').value=''; $('#network-filter').value='';
  $('#'+kind+'-filter').value=value;
  await refreshScope();
 },'identity-button');
 button.title=value;
 return button;
}
function svgElement(tag, attributes) {
 const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
 for (const [key,value] of Object.entries(attributes)) node.setAttribute(key,String(value));
 return node;
}
function chart(key, label, color) {
 const card=el('article',undefined,'card chart-card');
 const days=Array.from({length:30},(_,index)=>new Date(Date.parse(dashboardState.since)+index*86400000).toISOString().slice(0,10));
 const values=new Map(dashboardState.trends[key].map(row=>[row.day,row.count]));
 const started=dashboardState.viewsStarted?.slice(0,10);
 const points=days.map(day=>({day,value:key==='views'&&day<started?null:(values.get(day)||0)}));
 const known=points.filter(point=>point.value!==null);
 const peak=Math.max(1,...known.map(point=>point.value));
 const heading=el('h3',label);heading.append(el('span',known.reduce((sum,p)=>sum+p.value,0).toLocaleString()));card.append(heading);
 const svg=svgElement('svg',{viewBox:'0 0 320 180',role:'img','aria-label':label+'近30天曲线，峰值 '+peak});
 for (const y of [20,85,150]) svg.append(svgElement('line',{x1:20,x2:310,y1:y,y2:y,stroke:'#304348'}));
 const coordinates=points.map((point,index)=>({...point,x:20+index*10,y:150-(point.value||0)/peak*130})).filter(point=>point.value!==null);
 svg.append(svgElement('polyline',{points:coordinates.map(p=>p.x+','+p.y).join(' '),fill:'none',stroke:color,'stroke-width':2.5}));
 const selected=el('p','峰值 '+peak+' · 选择数据点查看日期','note');
 for (const point of coordinates) {
  const circle=svgElement('circle',{cx:point.x,cy:point.y,r:4,fill:color,tabindex:0,role:'button','aria-label':point.day+' '+point.value});
  const title=svgElement('title',{});title.textContent=point.day+' · '+point.value;circle.append(title);
  const show=()=>selected.textContent=point.day+' · '+point.value;
  circle.onclick=show;circle.onfocus=show;circle.onkeydown=event=>{if(event.key==='Enter'||event.key===' ')show();};svg.append(circle);
 }
 card.append(svg);
 const axis=el('div',undefined,'chart-axis');axis.append(el('span',days[0].slice(5)),el('span',days.at(-1).slice(5)));card.append(axis,selected);
 const details=el('details',undefined,'chart-detail');details.append(el('summary','逐日明细'));
 const table=el('table');for(const point of points){const row=el('tr');row.append(el('th',point.day),el('td',point.value===null?'尚未记录':point.value));table.append(row);}details.append(table);card.append(details);
 return card;
}
function renderDashboard() {
 const pageFilter=$('#page-filter');
 if(pageFilter.options.length===1)for(const page of state.pages){const option=el('option',page.title+' · '+page.path);option.value=page.path;pageFilter.append(option);}
 const charts=$('#trend-charts');charts.replaceChildren(chart('views','估算浏览','#9fd9c9'),chart('likes','留存点赞','#c6b7ed'),chart('comments','留存评论','#e6bb85'));
 $('#tracking-note').textContent='浏览记录起始 '+date(dashboardState.viewsStarted)+'，首日可能只有部分数据。点赞、评论按当前保留记录的提交日期统计，删除会影响曲线。人工调整仅改变展示总数。';
 const summary=$('#page-summary');summary.replaceChildren();
 for(const page of state.pages.filter(page=>!pageFilter.value||page.path===pageFilter.value)){
  const row=el('tr'),name=el('td',page.title);name.append(el('small',page.path));row.append(name,...[page.views,page.likes,page.recorded_likes,page.comment_count].map(value=>el('td',value)));
  const actions=el('td');for(const [tab,label] of [['comments','评论'],['visitors','点赞'],['pages','设置']])actions.append(btn(label,async()=>{pageFilter.value=page.path;await refreshScope();selectTab(tab);}));row.append(actions);summary.append(row);
 }
 const totals=dashboardState.totals;$('#visitor-totals').textContent='筛选范围内 '+totals.likes+' 条点赞 · '+totals.visitors+' 个匿名访客 · '+totals.networks+' 个保留中的网络分组';
 const rows=$('#like-list');rows.replaceChildren();
 for(const like of dashboardState.likes){const row=el('tr');row.append(el('td',like.page));for(const kind of ['actor','network']){const cell=el('td');cell.append(identityButton(kind,like[kind]));row.append(cell);}row.append(el('td',date(like.created_at)));const action=el('td');action.append(btn('删除点赞',()=>{if(confirm('删除此访客在 '+like.page+' 的这一条点赞？'))act({action:'delete_like',page:like.page,actor:like.actor,createdAt:like.created_at,confirm:like.page});},'danger'));row.append(action);rows.append(row);}
 if(!dashboardState.likes.length){const row=el('tr'),cell=el('td','暂无符合筛选的点赞。');cell.colSpan=5;row.append(cell);rows.append(row);}
 $('#more-likes').hidden=!dashboardState.next;
}
function statsEditor(page) {
 const form=el('div',undefined,'stats-form'),inputs={};
 for(const [key,label] of [['views','展示浏览量'],['likes','展示赞数']]){const wrap=el('label',label),input=el('input');input.type='number';input.min='0';input.max='1000000000';input.step='1';input.value=page[key];inputs[key]=input;wrap.append(input);form.append(wrap);}
 const reasonLabel=el('label','调整原因'),reason=el('input',undefined,'reason');reason.maxLength=200;reasonLabel.append(reason);form.append(reasonLabel);
 form.append(btn('保存展示计数',()=>{
  if(!Object.values(inputs).every(input=>input.value!==''&&input.reportValidity())||!reason.value.trim()){say('请填写整数计数和调整原因。');return;}
  if(confirm('将 '+page.path+' 的展示计数改为浏览 '+inputs.views.value+'、点赞 '+inputs.likes.value+'？'))act({action:'edit_stats',page:page.path,views:Number(inputs.views.value),likes:Number(inputs.likes.value),expectedViews:page.views,expectedLikes:page.likes,reason:reason.value,confirm:page.path});
 },'primary'));
 return form;
}
async function refreshScope(){try{await load();say('筛选已更新。');}catch(error){say(error.message);}}
$('#apply-scope').onclick=refreshScope;
$('#clear-scope').onclick=()=>{for(const key of ['page','actor','network'])$('#'+key+'-filter').value='';refreshScope();};
$('#more-likes').onclick=async()=>{
 const button=$('#more-likes');button.disabled=true;
 try{const params=scopeParams();params.set('after',dashboardState.next);const response=await fetch('/api/admin/dashboard?'+params,{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.code||'载入失败');dashboardState={...data,likes:dashboardState.likes.concat(data.likes)};renderDashboard();}catch(error){say(error.message);}finally{button.disabled=false;}
};
`;
