import http from 'node:http';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createCipheriv, createDecipheriv, timingSafeEqual, createHash } from 'node:crypto';
import { classify, fileName, parseUpload, subjects, types } from './library.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const base = (process.env.BASE_URL || `http://localhost:${port}`).replace(/\/$/, '');
const client = process.env.GOOGLE_CLIENT_ID || '';
const secret = process.env.GOOGLE_CLIENT_SECRET || '';
const owner = (process.env.ADMIN_EMAIL || '').toLowerCase();
const encKey = process.env.TOKEN_ENCRYPTION_KEY || '';
const actionKey = process.env.INGEST_API_KEY || '';
const configured = !!(client && secret && owner && /^[a-f\d]{64}$/i.test(encKey));
const secure = base.startsWith('https:');
if (!secure && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(base)) throw new Error('BASE_URL ต้องเป็น HTTPS เมื่อใช้งานออนไลน์');
const dataDir = resolve(process.env.DATA_DIR || './data');
const sessions = new Map();
const states = new Map();
let tokens = null, access = null, accessUntil = 0;
let uploadQueue = Promise.resolve();
const cleanup = setInterval(() => {for (const map of [sessions,states]) for (const [k,v] of map) if (v.until < Date.now()) map.delete(k);}, 60000);
cleanup.unref();

function send(res,status,data,headers={}) {
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}
function cookie(name,value,maxAge) {return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure?'; Secure':''}`;}
function cookies(req) {return Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split('=')).filter(p=>p.length===2));}
function session(req) {const id=cookies(req).kru_session; const s=sessions.get(id); return s && s.until>Date.now() ? s : null;}
function equal(a,b) {const x=Buffer.from(a || ''), y=Buffer.from(b || ''); return x.length===y.length && timingSafeEqual(x,y);}
function problem(message,status=400) {return Object.assign(new Error(message),{status});}
async function body(req) {
  const chunks=[];let size=0;
  for await (const c of req) {size+=c.length;if(size>22*1024*1024) throw problem('ข้อมูลเกินขนาดที่รองรับ',413);chunks.push(c);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw problem('รูปแบบ JSON ไม่ถูกต้อง');}
}
async function saveTokens(value) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',Buffer.from(encKey,'hex'),iv);
  const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const path=resolve(dataDir,'google.enc');
  await writeFile(path+'.tmp',Buffer.concat([iv,cipher.getAuthTag(),encrypted]),{mode:0o600});
  await rename(path+'.tmp',path);tokens=value;
}
async function loadTokens() {
  if(!configured)return;
  try {
    const b=await readFile(resolve(dataDir,'google.enc'));
    const decipher=createDecipheriv('aes-256-gcm',Buffer.from(encKey,'hex'),b.subarray(0,12));
    decipher.setAuthTag(b.subarray(12,28));
    tokens=JSON.parse(Buffer.concat([decipher.update(b.subarray(28)),decipher.final()]).toString());
    if(tokens.email!==owner) tokens=null;
  } catch(e) {if(e.code!=='ENOENT') console.error('อ่านการเชื่อม Google ไม่สำเร็จ ตรวจสอบ TOKEN_ENCRYPTION_KEY และ data volume');}
}
async function tokenRequest(params) {
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:client,client_secret:secret,...params}),signal:AbortSignal.timeout(30000)});
  const d=await r.json();if(!r.ok)throw problem('การเชื่อม Google หมดอายุหรือไม่ถูกต้อง กรุณาเชื่อมใหม่',401);return d;
}
async function getAccess() {
  if(!tokens?.refresh_token)throw problem('กรุณาเชื่อม Google Drive ก่อน',401);
  if(access && accessUntil>Date.now()+60000)return access;
  const d=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh_token});
  access=d.access_token;accessUntil=Date.now()+d.expires_in*1000;return access;
}
async function drive(path,options={}) {
  const token=await getAccess();
  const r=await fetch(`https://www.googleapis.com/${path}`,{...options,headers:{Authorization:`Bearer ${token}`,...options.headers},signal:AbortSignal.timeout(90000)});
  const d=await r.json();
  if(!r.ok)throw problem(r.status===403?'Google Drive ปฏิเสธสิทธิ์หรือโควตา กรุณาตรวจสอบบัญชี':r.status===401?'กรุณาเชื่อม Google Drive ใหม่':'Google Drive ทำรายการไม่สำเร็จ กรุณารีเฟรชตรวจสอบก่อนลองอีกครั้ง',r.status===401?401:502);
  return d;
}
const quote=s=>String(s).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
async function find(q,fields='id,name,webViewLink,size,createdTime,mimeType,appProperties') {
  let pageToken,files=[];
  do {
    const p=new URLSearchParams({q:`trashed = false and (${q})`,fields:`nextPageToken,files(${fields})`,pageSize:'1000'});
    if(pageToken)p.set('pageToken',pageToken);
    const d=await drive('drive/v3/files?'+p);files.push(...(d.files||[]));pageToken=d.nextPageToken;
    if(files.length>20000)throw problem('มีไฟล์มากเกินขอบเขตการอ่านครั้งเดียว',422);
  }while(pageToken);return files;
}
async function folder(name,parent=null) {
  const q=`mimeType = 'application/vnd.google-apps.folder' and name = '${quote(name)}' and `+(parent?`'${quote(parent)}' in parents`:`appProperties has { key='kruRoot' and value='v1' }`);
  const found=await find(q,'id');if(found.length)return found[0].id;
  const meta={name,mimeType:'application/vnd.google-apps.folder',...(parent?{parents:[parent]}:{appProperties:{kruRoot:'v1'}})};
  const created=await drive('drive/v3/files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});return created.id;
}
async function listFiles() {return find("appProperties has { key='kruLibrary' and value='v1' }");}
async function upload(input,requestId=null) {
  let parsed;try{parsed=parseUpload(input);}catch(e){throw problem(e.message);}
  const {bytes,ext,mime,meta}=parsed;
  const fingerprint=createHash('sha256').update(bytes).update(JSON.stringify(meta)).update(ext).digest('hex');
  if(requestId) {
    const old=await find(`appProperties has { key='requestId' and value='${quote(requestId)}' }`);
    if(old.length) {if(old[0].appProperties?.requestHash!==fingerprint)throw problem('request_id นี้ถูกใช้กับเนื้อหาอื่นแล้ว',409);return {...old[0],duplicate:true};}
  }
  let parent=await folder('คลังสื่อครู');
  for(const name of [meta.subject,meta.grade,meta.type])parent=await folder(name,parent);
  const metadata={name:fileName(meta,ext),parents:[parent],appProperties:{kruLibrary:'v1',...meta,...(requestId?{requestId,requestHash:fingerprint}:{})}};
  // Google custom properties allow at most 124 UTF-8 bytes per key/value pair.
  for(const [k,v] of Object.entries(metadata.appProperties))if(Buffer.byteLength(k+v)>124)metadata.appProperties[k]=Array.from(v).reduce((a,c)=>Buffer.byteLength(k+a+c)<=124?a+c:a,'');
  const boundary='kru_'+randomBytes(16).toString('hex');
  const payload=Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),bytes,Buffer.from(`\r\n--${boundary}--`)]);
  return drive('upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size,createdTime,mimeType,appProperties',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body:payload});
}
function enqueue(task) {const result=uploadQueue.then(task);uploadQueue=result.catch(()=>{});return result;}
const allowedAssets={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,base), path=url.pathname;
    if(req.method==='GET' && allowedAssets[path]) {
      const [file,type]=allowedAssets[path];return send(res,200,await readFile(resolve(root,'public',file),'utf8'),{'Content-Type':type,'Content-Security-Policy':"default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",'Referrer-Policy':'no-referrer'});
    }
    if(req.method==='GET' && path==='/api/status')return send(res,200,{configured,signedIn:!!session(req),connected:!!tokens?.refresh_token,email:session(req)?owner:null,subjects,types,actionsEnabled:actionKey.length>=32});
    if(req.method==='GET' && path==='/auth/google') {
      if(!configured)throw problem('ต้องตั้งค่า Google OAuth และ ADMIN_EMAIL ใน .env ก่อน',503);
      const state=randomBytes(24).toString('hex');states.set(state,{until:Date.now()+600000});
      const params=new URLSearchParams({client_id:client,redirect_uri:base+'/oauth/callback',response_type:'code',scope:'openid email https://www.googleapis.com/auth/drive.file',access_type:'offline',prompt:'consent',state});
      return send(res,302,'',{'Location':'https://accounts.google.com/o/oauth2/v2/auth?'+params,'Set-Cookie':cookie('kru_oauth',state,600)});
    }
    if(req.method==='GET' && path==='/oauth/callback') {
      const state=url.searchParams.get('state');const stored=states.get(state);states.delete(state);
      if(!stored || stored.until<Date.now() || !equal(cookies(req).kru_oauth,state))throw problem('การเข้าสู่ระบบหมดอายุ กรุณาเริ่มใหม่',403);
      if(url.searchParams.has('error'))return send(res,302,'',{Location:'/?auth=cancelled'});
      const d=await tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code')||'',redirect_uri:base+'/oauth/callback'});
      const identity=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+d.access_token},signal:AbortSignal.timeout(30000)});
      if(!identity.ok)throw problem('ตรวจสอบบัญชี Google ไม่สำเร็จ',403);
      const person=await identity.json();
      if(!person.email_verified || person.email?.toLowerCase()!==owner)throw problem('บัญชีนี้ไม่ใช่เจ้าของคลังที่กำหนดใน ADMIN_EMAIL',403);
      const refresh=d.refresh_token || tokens?.refresh_token;if(!refresh)throw problem('Google ไม่ได้ส่งสิทธิ์ใช้งานต่อเนื่อง กรุณาเชื่อมใหม่',401);
      await saveTokens({email:owner,refresh_token:refresh});access=d.access_token;accessUntil=Date.now()+d.expires_in*1000;
      const id=randomBytes(32).toString('hex');sessions.set(id,{until:Date.now()+8*3600000});
      return send(res,302,'',{Location:'/', 'Set-Cookie':[cookie('kru_session',id,28800),cookie('kru_oauth','',0)]});
    }
    if(req.method==='GET' && path==='/openapi.json') {
      const schema=JSON.parse(await readFile(resolve(root,'openapi.json'),'utf8'));schema.servers=[{url:base}];return send(res,200,schema);
    }
    if(req.method==='POST' && path==='/api/ingest') {
      if(actionKey.length<32 || !equal(req.headers.authorization,'Bearer '+actionKey))throw problem('API key ไม่ถูกต้อง',401);
      const input=await body(req);
      if(!input || typeof input!=='object')throw problem('รูปแบบ JSON ไม่ถูกต้อง');
      if(typeof input.request_id!=='string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(input.request_id))throw problem('request_id ต้องมี 16–80 ตัวอักษร');
      if(typeof input.text_content==='string') {
        if(!/\.(html|md|txt)$/i.test(input.name||''))throw problem('text_content ใช้กับไฟล์ HTML, Markdown หรือ TXT เท่านั้น');
        input.content_base64=Buffer.from(input.text_content,'utf8').toString('base64');
      }
      return send(res,200,{file:await enqueue(()=>upload(input,input.request_id))});
    }
    if(path.startsWith('/api/')) {
      if(!session(req))throw problem('กรุณาเข้าสู่ระบบด้วย Google ก่อน',401);
      if(req.method==='POST' && req.headers.origin!==base)throw problem('Origin ไม่ถูกต้อง',403);
      if(req.method==='GET' && path==='/api/files')return send(res,200,{files:await listFiles()});
      if(req.method==='POST' && path==='/api/classify') {const d=await body(req);if(typeof d.name!=='string')throw problem('ชื่อไฟล์ไม่ถูกต้อง');return send(res,200,classify(d.name));}
      if(req.method==='POST' && path==='/api/upload') {const d=await body(req);if(typeof d.request_id!=='string'||!/^[a-zA-Z0-9_-]{16,80}$/.test(d.request_id))throw problem('request_id ไม่ถูกต้อง');return send(res,201,{file:await enqueue(()=>upload(d,d.request_id))});}
      if(req.method==='POST' && path==='/api/logout') {sessions.delete(cookies(req).kru_session);return send(res,200,{ok:true},{'Set-Cookie':cookie('kru_session','',0)});}
    }
    send(res,404,{error:'ไม่พบหน้าที่ต้องการ'});
  }catch(e){send(res,e.status||500,{error:e.status||e.message?.startsWith('กรุณา')||e.message?.startsWith('ไม่รองรับ')||e.message?.startsWith('รองรับ')||e.message?.startsWith('ข้อมูล')?e.message:'ระบบทำรายการไม่สำเร็จ กรุณาตรวจสอบการตั้งค่าและลองใหม่'});}
});
await loadTokens();
server.listen(port,()=>console.log(`คลังสื่อครู: ${base} | Google OAuth: ${configured?'พร้อม':'ยังไม่ตั้งค่า'}`));
