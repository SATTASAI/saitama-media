import { Buffer } from 'node:buffer';
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'node:crypto';
import { subjects, types, classify } from './library.mjs';
import { createDriveClient } from './drive-client.mjs';

const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export function json(value,status=200,extra={}) {return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});}
function equal(a,b) {const x=Buffer.from(a||''),y=Buffer.from(b||'');return x.length===y.length&&timingSafeEqual(x,y);}
function cookie(name,value,age,secure) {return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;}
function cookies(req) {return Object.fromEntries((req.headers.get('Cookie')||'').split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2));}
export async function readBody(req) {
  if(!req.body)throw problem('รูปแบบ JSON ไม่ถูกต้อง');
  const reader=req.body.getReader(),chunks=[];let size=0;
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>22*1024*1024){await reader.cancel();throw problem('ข้อมูลเกินขนาดที่รองรับ',413);}chunks.push(value);}}finally{reader.releaseLock();}
  let d;try{d=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw problem('รูปแบบ JSON ไม่ถูกต้อง');}
  if(!d||typeof d!=='object'||Array.isArray(d))throw problem('รูปแบบ JSON ไม่ถูกต้อง');return d;
}
export function baseURL(env,request) {
  const b=(env.BASE_URL||new URL(request.url).origin).replace(/\/$/,'');
  const u=new URL(b);if(u.origin!==b || (u.protocol!=='https:'&&!['http://localhost:8787','http://127.0.0.1:8787'].includes(b)))throw problem('BASE_URL ต้องเป็น origin HTTPS ของระบบ',503);return b;
}
function configured(env) {return !!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.ADMIN_EMAIL&&/^[a-f\d]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY||''));}
function encrypt(value,key) {const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(key,'hex'),iv),data=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]).toString('base64');}
function decrypt(value,key) {const b=Buffer.from(value,'base64'),d=createDecipheriv('aes-256-gcm',Buffer.from(key,'hex'),b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return JSON.parse(Buffer.concat([d.update(b.subarray(28)),d.final()]).toString());}

export class LibraryApplication {
  constructor(ctx,env) {
    this.store=ctx.storage;this.env=env;this.queue=Promise.resolve();
    this.drive=createDriveClient(()=>this.getAccess());
  }
  enqueue(fn) {const next=this.queue.then(fn);this.queue=next.catch(()=>{});return next;}
  async credential() {
    if(!configured(this.env))return null;
    const encrypted=await this.store.get('google');if(!encrypted)return null;
    try {const t=decrypt(encrypted,this.env.TOKEN_ENCRYPTION_KEY);return t.email===this.env.ADMIN_EMAIL.toLowerCase()?t:null;}catch{throw problem('อ่านการเชื่อม Google ไม่สำเร็จ กรุณาเชื่อมใหม่หลังเปลี่ยนคีย์',503);}
  }
  async expiringGet(key) {const v=await this.store.get(key);if(!v)return null;if(v.until<=Date.now()){await this.store.delete(key);return null;}return v;}
  async expiringPut(key,value,ttl) {await this.store.put(key,{...value,until:Date.now()+ttl});if(!await this.store.getAlarm())await this.store.setAlarm(Date.now()+3600000);}
  async alarm() {
    for(const prefix of ['session:','oauth:']) {const rows=await this.store.list({prefix});const expired=[...rows].filter(([,v])=>v.until<=Date.now()).map(([k])=>k);if(expired.length)await this.store.delete(expired);}
    // Keep cleanup scheduled while the object has temporary credentials.
    if((await this.store.list({prefix:'session:',limit:1})).size||(await this.store.list({prefix:'oauth:',limit:1})).size)await this.store.setAlarm(Date.now()+3600000);
  }
  async tokenRequest(params) {
    const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:this.env.GOOGLE_CLIENT_ID,client_secret:this.env.GOOGLE_CLIENT_SECRET,...params}),signal:AbortSignal.timeout(30000)});
    const d=await r.json();if(!r.ok)throw problem('การเชื่อม Google หมดอายุหรือไม่ถูกต้อง กรุณาเชื่อมใหม่',401);return d;
  }
  async getAccess() {
    const t=await this.credential();if(!t?.refresh_token)throw problem('กรุณาเชื่อม Google Drive ก่อน',401);
    if(this.access&&this.accessUntil>Date.now()+60000)return this.access;
    const d=await this.tokenRequest({grant_type:'refresh_token',refresh_token:t.refresh_token});this.access=d.access_token;this.accessUntil=Date.now()+d.expires_in*1000;return this.access;
  }
  async fetch(req) {
    try{return await this.route(req);}catch(e){return json({error:e.status?e.message:'ระบบทำรายการไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าและลองใหม่'},e.status||500);}
    finally {if(req.body&&!req.bodyUsed)await req.body.cancel().catch(()=>{});}
  }
  async route(req) {
    const env=this.env,base=baseURL(env,req),secure=base.startsWith('https:'),url=new URL(req.url),path=url.pathname;
    const owner=(env.ADMIN_EMAIL||'').toLowerCase();
    const sid=cookies(req).kru_session;
    const loggedIn=sid&&/^[a-f\d]{64}$/.test(sid)?await this.expiringGet('session:'+sid):null;
    const signedIn=loggedIn?.email===owner&&configured(env);
    if(req.method==='GET'&&path==='/api/status') {
      let connected=false;try{connected=!!(await this.credential())?.refresh_token;}catch{/* Allow the owner to reconnect after encryption-key rotation. */}
      return json({configured:configured(env),signedIn:!!signedIn,connected,email:signedIn?owner:null,subjects,types,actionsEnabled:(env.INGEST_API_KEY||'').length>=32});
    }
    if(req.method==='GET'&&path==='/auth/google') {
      if(!configured(env))throw problem('ต้องตั้งค่า Google OAuth และ ADMIN_EMAIL ใน Cloudflare ก่อน',503);
      const state=randomBytes(24).toString('hex');await this.expiringPut('oauth:'+state,{},600000);
      const params=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:base+'/oauth/callback',response_type:'code',scope:'openid email https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state});
      return new Response(null,{status:302,headers:{Location:'https://accounts.google.com/o/oauth2/v2/auth?'+params,'Cache-Control':'no-store','Set-Cookie':cookie('kru_oauth',state,600,secure)}});
    }
    if(req.method==='GET'&&path==='/oauth/callback') {
      const state=url.searchParams.get('state');if(!state||!/^[a-f\d]{48}$/.test(state)||!equal(cookies(req).kru_oauth,state))throw problem('การเข้าสู่ระบบหมดอายุ กรุณาเริ่มใหม่',403);
      // Transaction consumes the state before any external call, including simultaneous callbacks.
      const stored=await this.store.transaction(async tx=>{const v=await tx.get('oauth:'+state);await tx.delete('oauth:'+state);return v;});
      if(!stored||stored.until<=Date.now())throw problem('การเข้าสู่ระบบหมดอายุ กรุณาเริ่มใหม่',403);
      if(url.searchParams.has('error'))return new Response(null,{status:302,headers:{Location:base+'/?auth=cancelled','Cache-Control':'no-store'}});
      const d=await this.tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:base+'/oauth/callback'});
      const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+d.access_token},signal:AbortSignal.timeout(30000)});
      if(!identity.ok)throw problem('ตรวจสอบบัญชี Google ไม่สำเร็จ',403);const person=await identity.json();
      if(!person.email_verified||person.email?.toLowerCase()!==owner)throw problem('บัญชีนี้ไม่ใช่เจ้าของคลังที่กำหนดใน ADMIN_EMAIL',403);
      let previous=null;try{previous=await this.credential();}catch{/* Owner may replace unreadable credentials after key rotation. */}
      const refresh=d.refresh_token||previous?.refresh_token;if(!refresh)throw problem('Google ไม่ได้ส่งสิทธิ์ใช้งานต่อเนื่อง กรุณาเชื่อมใหม่',401);
      await this.store.put('google',encrypt({email:owner,refresh_token:refresh},env.TOKEN_ENCRYPTION_KEY));this.access=d.access_token;this.accessUntil=Date.now()+d.expires_in*1000;
      const id=randomBytes(32).toString('hex');await this.expiringPut('session:'+id,{email:owner},8*3600000);
      const headers=new Headers({Location:base+'/','Cache-Control':'no-store'});headers.append('Set-Cookie',cookie('kru_session',id,28800,secure));headers.append('Set-Cookie',cookie('kru_oauth','',0,secure));return new Response(null,{status:302,headers});
    }
    if(req.method==='POST'&&path==='/api/ingest') {
      if((env.INGEST_API_KEY||'').length<32||!equal(req.headers.get('Authorization'),'Bearer '+env.INGEST_API_KEY))throw problem('API key ไม่ถูกต้อง',401);
      const input=await readBody(req);checkRequestId(input);
      if(typeof input.text_content==='string') {if(!/\.(html|md|txt)$/i.test(input.name||''))throw problem('text_content ใช้กับไฟล์ HTML, Markdown หรือ TXT เท่านั้น');input.content_base64=Buffer.from(input.text_content,'utf8').toString('base64');}
      return json({file:await this.enqueue(()=>this.drive.upload(input,input.request_id))});
    }
    if(path.startsWith('/api/')) {
      if(!signedIn)throw problem('กรุณาเข้าสู่ระบบด้วย Google ก่อน',401);
      if(req.method==='POST'&&req.headers.get('Origin')!==base)throw problem('Origin ไม่ถูกต้อง',403);
      if(req.method==='GET'&&path==='/api/files')return json({files:await this.drive.listFiles()});
      if(req.method==='POST'&&path==='/api/classify'){const d=await readBody(req);if(typeof d.name!=='string')throw problem('ชื่อไฟล์ไม่ถูกต้อง');return json(classify(d.name));}
      if(req.method==='POST'&&path==='/api/upload'){const d=await readBody(req);checkRequestId(d);return json({file:await this.enqueue(()=>this.drive.upload(d,d.request_id))},201);}
      if(req.method==='POST'&&path==='/api/logout'){await this.store.delete('session:'+sid);return json({ok:true},200,{'Set-Cookie':cookie('kru_session','',0,secure)});}
    }
    return json({error:'ไม่พบหน้าที่ต้องการ'},404);
  }
}
function checkRequestId(input) {if(typeof input.request_id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(input.request_id))throw problem('request_id ต้องมี 16–80 ตัวอักษร');}

