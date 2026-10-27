import test from 'node:test';
import assert from 'node:assert/strict';
import { LibraryApplication } from '../worker-app.mjs';

class Storage {
  data=new Map();alarm=null;
  async get(k){return this.data.get(k);}
  async put(k,v){this.data.set(k,structuredClone(v));}
  async delete(k){for(const key of Array.isArray(k)?k:[k])this.data.delete(key);}
  async list({prefix='',limit=Infinity}={}){return new Map([...this.data].filter(([k])=>k.startsWith(prefix)).slice(0,limit));}
  async getAlarm(){return this.alarm;}
  async setAlarm(v){this.alarm=v;}
  async transaction(fn){return fn(this);}
}
test('Workers OAuth → persistent encrypted credentials → upload and retry across cold start (mock Google)',async t=>{
  const env={BASE_URL:'https://saitama-media.example',ADMIN_EMAIL:'owner@example.com',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'test-secret',TOKEN_ENCRYPTION_KEY:'ab'.repeat(32),INGEST_API_KEY:'test-ingest-key-'.repeat(3)};
  const storage=new Storage(),ctx={storage};let app=new LibraryApplication(ctx,env),personEmail='owner@example.com';
  const files=[],folders=[];
  t.mock.method(globalThis,'fetch',async(input,options={})=>{
    const url=new URL(input);
    if(url.hostname==='oauth2.googleapis.com')return Response.json({access_token:'mock-access',refresh_token:'mock-private-refresh',expires_in:3600});
    if(url.hostname==='openidconnect.googleapis.com')return Response.json({email:personEmail,email_verified:true});
    assert.equal(url.hostname,'www.googleapis.com');
    assert.equal(options.headers.Authorization,'Bearer mock-access');
    if(url.pathname.startsWith('/upload/')) {
      const content=Buffer.from(options.body).toString('utf8'),meta=JSON.parse(content.match(/\r\n\r\n(.*?)\r\n--kru_/s)[1]);
      const file={...meta,id:'file-'+(files.length+1),webViewLink:'https://drive.google.com/file/d/mock/view',createdTime:new Date().toISOString()};files.push(file);return Response.json(file);
    }
    if(options.method==='POST'){const d=JSON.parse(options.body);const folder={...d,id:'folder-'+(folders.length+1)};folders.push(folder);return Response.json(folder);}
    const q=url.searchParams.get('q');
    if(q.includes("key='requestId'")){const id=q.match(/key='requestId' and value='([^']+)'/)[1];return Response.json({files:files.filter(f=>f.appProperties.requestId===id)});}
    if(q.includes("key='kruLibrary'"))return Response.json({files});
    const name=q.match(/name = '([^']+)'/)?.[1];return Response.json({files:folders.filter(f=>f.name===name)});
  });
  const request=(path,{method='GET',body,cookie,origin,authorization}={})=>new Request(env.BASE_URL+path,{method,headers:{...(cookie?{Cookie:cookie}:{}),...(origin?{Origin:origin}:{}),...(authorization?{Authorization:authorization}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  assert.equal((await app.fetch(request('/api/files'))).status,401);
  assert.equal((await app.fetch(request('/api/ingest',{method:'POST',authorization:'Bearer wrong',body:{}}))).status,401);
  assert.equal((await app.fetch(request('/oauth/callback?state=forged&code=bad'))).status,403);
  async function start(){const r=await app.fetch(request('/auth/google'));assert.equal(r.status,302);const state=new URL(r.headers.get('Location')).searchParams.get('state');return {state,cookie:'kru_oauth='+state};}
  personEmail='intruder@example.com';const rejected=await start();
  assert.equal((await app.fetch(request('/oauth/callback?state='+rejected.state+'&code=fake',{cookie:rejected.cookie}))).status,403);
  assert.equal(await storage.get('google'),undefined);
  personEmail=env.ADMIN_EMAIL;const oauth=await start();
  const login=await app.fetch(request('/oauth/callback?state='+oauth.state+'&code=fake',{cookie:oauth.cookie}));assert.equal(login.status,302);
  const session=login.headers.getSetCookie().find(c=>c.startsWith('kru_session=')).split(';')[0];
  assert.ok(login.headers.getSetCookie().every(c=>c.includes('HttpOnly')&&c.includes('Secure')));
  assert.ok(!String(await storage.get('google')).includes('mock-private-refresh'));
  assert.equal((await app.fetch(request('/oauth/callback?state='+oauth.state+'&code=fake',{cookie:oauth.cookie}))).status,403);
  app=new LibraryApplication(ctx,env);
  const status=await app.fetch(request('/api/status',{cookie:session})).then(r=>r.json());assert.equal(status.signedIn,true);assert.equal(status.connected,true);
  const upload={request_id:'worker-test-request-123',name:'คณิตศาสตร์_ป.3_ใบงาน.html',text_content:'<h1>การคูณ</h1>'};
  const params={method:'POST',authorization:'Bearer '+env.INGEST_API_KEY,body:upload};
  const results=await Promise.all([app.fetch(request('/api/ingest',params)),app.fetch(request('/api/ingest',params))]);assert.ok(results.every(r=>r.status===200));assert.equal(files.length,1);assert.equal(folders.length,4);
  app=new LibraryApplication(ctx,env);
  const retried=await app.fetch(request('/api/ingest',params)).then(r=>r.json());assert.equal(retried.file.duplicate,true);assert.equal(files.length,1);
  assert.equal((await app.fetch(request('/api/ingest',{...params,body:{...upload,text_content:'different'}}))).status,409);
  const listing=await app.fetch(request('/api/files',{cookie:session})).then(r=>r.json());assert.equal(listing.files.length,1);
  assert.equal(listing.files[0].appProperties.subject,'คณิตศาสตร์');assert.equal(listing.files[0].appProperties.grade,'ป.3');
  assert.equal((await app.fetch(request('/api/classify',{method:'POST',cookie:session,origin:'https://evil.example',body:{name:'x'}}))).status,403);
  const classification=await app.fetch(request('/api/classify',{method:'POST',cookie:session,origin:env.BASE_URL,body:{name:'ภาษาไทย ป.2.pdf'}})).then(r=>r.json());assert.equal(classification.subject,'ภาษาไทย');
  const analyzed=await app.fetch(request('/api/classify',{method:'POST',cookie:session,origin:env.BASE_URL,body:{name:'untitled.html',content_base64:Buffer.from('<h1>English worksheet Grade 4 Animals</h1>').toString('base64')}})).then(r=>r.json());
  assert.equal(analyzed.title,'English worksheet Grade 4 Animals');assert.equal(analyzed.type,'ใบงาน');assert.equal(analyzed.analysis.source,'content');
  assert.equal((await app.fetch(request('/api/classify',{method:'POST',cookie:session,origin:env.BASE_URL,body:{name:'bad.pdf',content_base64:'bad'}}))).status,400);
  assert.equal((await app.fetch(request('/api/logout',{method:'POST',cookie:session,origin:env.BASE_URL,body:{}}))).status,200);
  app=new LibraryApplication(ctx,env);assert.equal((await app.fetch(request('/api/files',{cookie:session}))).status,401);
  await storage.put('session:expired',{until:0,email:env.ADMIN_EMAIL});await app.alarm();assert.equal(await storage.get('session:expired'),undefined);
});
