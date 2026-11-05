import {readdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const pages=[];
const decode=s=>s.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'");
async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(entry.name==='index.html'){
 const html=await readFile(full,'utf8');if(!html.includes('data-site-interactions')||/<meta\s+[^>]*name="robots"[^>]*content="[^"]*noindex/i.test(html))continue;
 const canonical=html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/);if(!canonical)continue;const u=new URL(decode(canonical[1]));
 if(u.origin!=='https://zhuqing.tech'||u.search||u.hash||!u.pathname.endsWith('/'))continue;
 const title=decode(html.match(/<title>([^<]*)<\/title>/)?.[1]||u.pathname).slice(0,200);pages.push({path:decodeURI(u.pathname),title});
}}}
await walk(path.join(root,'dist'));pages.sort((a,b)=>a.path.localeCompare(b.path));
if(!pages.some(p=>p.path==='/'))throw Error('Build the site before generating the interaction registry');
await writeFile(path.join(root,'backend/interactions/pages.json'),JSON.stringify(pages,null,2)+'\n');console.log(`Registered ${pages.length} public interaction pages; private/noindex pages excluded.`);
