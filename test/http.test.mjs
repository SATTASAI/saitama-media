import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('ป้องกันการอ่าน/เขียนโดยไม่เข้าสู่ระบบ และไม่เผยความลับ',async t=>{
  const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');
  const port=probe.address().port;await new Promise(r=>probe.close(r));
  const data=await mkdtemp(join(tmpdir(),'kru-test-'));
  const key='test-api-key-'.repeat(4), origin=`http://localhost:${port}`;
  const child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),BASE_URL:origin,GOOGLE_CLIENT_ID:'',GOOGLE_CLIENT_SECRET:'',ADMIN_EMAIL:'',TOKEN_ENCRYPTION_KEY:'',INGEST_API_KEY:key,DATA_DIR:data},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{child.kill();await once(child,'exit');await rm(data,{recursive:true,force:true});});
  await Promise.race([once(child.stdout,'data'),once(child,'error').then(([e])=>{throw e;})]);
  const status=await fetch(origin+'/api/status').then(r=>r.json());
  assert.equal(status.configured,false);assert.equal(status.signedIn,false);assert.equal(status.email,null);
  assert.equal((await fetch(origin+'/api/files')).status,401);
  assert.equal((await fetch(origin+'/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal((await fetch(origin+'/api/ingest',{method:'POST',headers:{Authorization:'Bearer wrong'},body:'{}'})).status,401);
  const post=d=>fetch(origin+'/api/ingest',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(d)});
  assert.equal((await post({request_id:'short'})).status,400);
  assert.equal((await post({request_id:'valid-request-id-123',name:'x.pdf',content_base64:'invalid'})).status,400);
  assert.equal((await post({request_id:'valid-request-id-123',name:'x.exe',content_base64:'YQ=='})).status,400);
  assert.equal((await post({request_id:'valid-request-id-123',name:'x.html',text_content:'<h1>ใบงาน</h1>'})).status,401);
  assert.equal((await fetch(origin+'/oauth/callback?state=forged&code=fake')).status,403);
  const response=await fetch(origin+'/');const html=await response.text();
  assert.equal(response.status,200);assert.ok(response.headers.get('content-security-policy').includes("frame-ancestors 'none'"));assert.ok(!html.includes(key));
  const font=await fetch(origin+'/fonts/noto-sans-thai-thai.woff2');assert.equal(font.headers.get('content-type'),'font/woff2');assert.equal(Buffer.from(await font.arrayBuffer()).subarray(0,4).toString(),'wOF2');
  for(const [path,mime,signature] of [['/fonts/lora-latin-600.woff2','font/woff2','wOF2'],['/assets/cover-animals.webp','image/webp','RIFF'],['/assets/brand-mark.png','image/png',null],['/icons/upload-simple.svg','image/svg+xml',null]]){
    const asset=await fetch(origin+path);assert.equal(asset.status,200);assert.equal(asset.headers.get('content-type'),mime);
    const bytes=Buffer.from(await asset.arrayBuffer());assert.ok(bytes.length>100);if(signature)assert.equal(bytes.subarray(0,4).toString(),signature);
    if(path.endsWith('.png'))assert.equal(bytes.subarray(1,4).toString(),'PNG');
    const head=await fetch(origin+path,{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
  }
  for(const path of ['/public-assets.mjs','/server.mjs','/icons/unknown.svg','/assets/unknown.webp'])assert.equal((await fetch(origin+path)).status,404);
  const schema=await fetch(origin+'/openapi.json').then(r=>r.json());assert.equal(schema.servers[0].url,origin);assert.ok(!JSON.stringify(schema).includes(key));
  assert.equal((await fetch(origin+'/.env')).status,404);
  assert.equal((await fetch(origin+'/data/google.enc')).status,404);
});
