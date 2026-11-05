import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createApp} from './worker.mjs';
export class LocalD1{
 constructor(){this.db=new DatabaseSync(':memory:');for(const file of ['0001.sql','0002_dashboard.sql','0003_comment_replies.sql','0004_comment_ownership_email.sql'])this.db.exec(readFileSync(new URL('./migrations/'+file,import.meta.url),'utf8'));}
 prepare(sql){const owner=this;let args=[];return {bind(...values){args=values;return this;},async first(){return owner.db.prepare(sql).get(...args)||null;},async all(){return {success:true,results:owner.db.prepare(sql).all(...args)};},async run(){const r=owner.db.prepare(sql).run(...args);return {success:true,meta:{changes:Number(r.changes)}};},execute(){const stmt=owner.db.prepare(sql);if(stmt.columns().length)return {success:true,results:stmt.all(...args)};const r=stmt.run(...args);return {success:true,meta:{changes:Number(r.changes)},results:[]};}};}
 async batch(statements){this.db.exec('BEGIN');try{const result=statements.map(s=>s.execute());this.db.exec('COMMIT');return result;}catch(e){this.db.exec('ROLLBACK');throw e;}}
}
export const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',keys.publicKey);publicKey.kid='test-key';publicKey.alg='RS256';
const enc=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
export async function jwt(claims={},header={}){const stamp=Math.floor(Date.now()/1000),body={iss:'https://qa-team.cloudflareaccess.com',aud:['qa-audience'],sub:'admin-sub',email:'zq_eugene@qq.com',exp:stamp+3600,iat:stamp,...claims};const input=enc({alg:'RS256',kid:'test-key',...header})+'.'+enc(body);return input+'.'+Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(input))).toString('base64url');}
export async function fixture(){
 const DB=new LocalD1(),calls=[],clock={value:Date.now()},scenario={challenge:true,host:'zhuqing.tech',mailStatus:200,mailBody:{id:'mock-mail'},throwMail:false};
 const env={DB,ABUSE_SECRET:'test-only-secret-at-least-32-characters-long',ALLOWED_ORIGINS:'https://zhuqing.tech',TURNSTILE_HOSTNAMES:'zhuqing.tech',TURNSTILE_SECRET_KEY:'test',RESEND_API_KEY:'test-secret',MAIL_FROM:'contact@example.com',ACCESS_TEAM_DOMAIN:'qa-team.cloudflareaccess.com',ACCESS_AUD:'qa-audience',ADMIN_EMAILS:'zq_eugene@qq.com',PUBLIC_LIMITER:{limit:async()=>({success:true})},GLOBAL_LIMITER:{limit:async()=>({success:true})}};
 const fetcher=async(url,init)=>{calls.push({url,init});if(url.endsWith('/certs'))return Response.json({keys:[publicKey]});if(url.includes('siteverify')){const params=new URLSearchParams(init.body);return Response.json({success:scenario.challenge,hostname:scenario.host,action:params.get('response').split('-')[0]});}if(url.includes('api.resend.com')){if(scenario.throwMail)throw Error('private details');return Response.json(scenario.mailBody,{status:scenario.mailStatus});}throw Error('Unexpected external request');};
 const app=createApp({pages:[{path:'/',title:'首页'},{path:'/portfolio/puguang/',title:'扑光'}],fetcher,now:()=>clock.value});
 const request=async(route,data,options={})=>{const headers={Origin:'https://zhuqing.tech','CF-Connecting-IP':'192.0.2.42',...options.headers};let method=data===undefined?'GET':'POST';if(data!==undefined)headers['Content-Type']='application/json';return app.fetch(new Request('https://api.example.com'+route,{method,...options,headers,...(data!==undefined?{body:typeof data==='string'?data:JSON.stringify(data)}:{})}),env);};
 const adminToken=await jwt();const admin=async(data,options={})=>request(data===undefined?'/api/admin/data':'/api/admin/action',data,{headers:{Origin:'https://api.example.com','Cf-Access-Jwt-Assertion':adminToken,'X-Admin-Action':'1',...options.headers},...options});
 const payload=(action='comment',extra={})=>({page:'/',visitor:crypto.randomUUID(),nickname:'访客',body:'Hello <img src=x onerror=alert(1)>',requestId:crypto.randomUUID(),website:'',token:action+'-token',...extra});
 return {DB,env,calls,clock,scenario,app,request,admin,payload,fetcher,adminToken};
}
