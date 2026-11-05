const encoder = new TextEncoder();
export class HttpError extends Error { constructor(status,code) { super(code); this.status=status; this.code=code; } }
export const assert = (ok,status,code) => { if(!ok) throw new HttpError(status,code); };
export const uuid = v => typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const emailOK = v => typeof v==='string' && v.length<=254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/.test(v);
export const list = v => String(v||'').split(',').map(x=>x.trim()).filter(Boolean);
export const text = (v,max,optional=false) => { assert(typeof v==='string',400,'invalid_input'); const s=v.trim(); assert((optional||s.length>0)&&s.length<=max&&!/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(s),400,'invalid_input');return s; };
export async function hmac(secret,value) { const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']); const bytes=await crypto.subtle.sign('HMAC',key,encoder.encode(value));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export async function readJSON(req) {
  assert(req.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase()==='application/json',415,'json_required');
  assert(Number(req.headers.get('Content-Length')||0)<=16384,413,'too_large');
  const reader=req.body?.getReader();assert(reader,400,'invalid_json');let size=0,body='';const decoder=new TextDecoder('utf-8',{fatal:true});
  try { while(true){ const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){await reader.cancel();throw new HttpError(413,'too_large');}body+=decoder.decode(value,{stream:true}); }body+=decoder.decode();const data=JSON.parse(body);assert(data&&typeof data==='object'&&!Array.isArray(data),400,'invalid_json');return data; }
  catch(e){ if(e instanceof HttpError)throw e;throw new HttpError(400,'invalid_json'); }
}
export async function verifyChallenge(data,env,ip,action,fetcher) {
  assert(env.TURNSTILE_SECRET_KEY && list(env.TURNSTILE_HOSTNAMES).length,503,'protection_unconfigured');
  assert(typeof data.token==='string'&&data.token.length>0&&data.token.length<=2048,400,'verification_required');
  let secret;
  try {
    const binding = env.TURNSTILE_SECRET_KEY;
    secret = typeof binding === 'string' ? binding : await binding.get();
  } catch {
    throw new HttpError(503, 'verification_unavailable');
  }
  assert(typeof secret === 'string' && secret.length > 0,503,'protection_unconfigured');
  const result=await fetcher('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({secret,response:data.token,remoteip:ip}),signal:AbortSignal.timeout(8000)});
  assert(result.ok,503,'verification_unavailable');const v=await result.json();
  assert(v.success===true&&v.action===action&&list(env.TURNSTILE_HOSTNAMES).includes(v.hostname),400,'verification_failed');
}
function decode(s) { assert(/^[A-Za-z0-9_-]+$/.test(s),401,'unauthorized');return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)); }
export function accessVerifier(fetcher=fetch,now=()=>Date.now()) {
  let cached=null;
  return async (req,env) => {
    assert(/^[a-z0-9-]+\.cloudflareaccess\.com$/.test(env.ACCESS_TEAM_DOMAIN||'')&&env.ACCESS_AUD&&list(env.ADMIN_EMAILS).length,503,'admin_unconfigured');
    const token=req.headers.get('Cf-Access-Jwt-Assertion');assert(token&&token.length<12000,401,'unauthorized');
    try {
      const parts=token.split('.');assert(parts.length===3,401,'unauthorized');
      const header=JSON.parse(new TextDecoder().decode(decode(parts[0]))),claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
      assert(header.alg==='RS256'&&typeof header.kid==='string'&&header.kid.length<200,401,'unauthorized');
      const issuer=`https://${env.ACCESS_TEAM_DOMAIN}`;
      if(!cached||cached.issuer!==issuer||cached.until<now()) { const res=await fetcher(`${issuer}/cdn-cgi/access/certs`,{signal:AbortSignal.timeout(5000)});assert(res.ok,503,'identity_unavailable');const j=await res.json();cached={issuer,until:now()+300000,keys:j.keys}; }
      const jwk=cached.keys?.find(k=>k.kid===header.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256'));assert(jwk,401,'unauthorized');
      const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
      assert(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])),401,'unauthorized');
      const seconds=Math.floor(now()/1000),aud=Array.isArray(claims.aud)?claims.aud:[claims.aud];
      assert(claims.iss===issuer&&aud.includes(env.ACCESS_AUD)&&Number.isFinite(claims.exp)&&claims.exp>seconds&&(!claims.nbf||claims.nbf<=seconds+30)&&typeof claims.sub==='string',401,'unauthorized');
      assert(typeof claims.email==='string'&&list(env.ADMIN_EMAILS).map(e=>e.toLowerCase()).includes(claims.email.toLowerCase()),403,'not_admin');
      return claims.email.toLowerCase();
    }catch(e){if(e instanceof HttpError)throw e;throw new HttpError(401,'unauthorized');}
  };
}
