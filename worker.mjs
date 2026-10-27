import { DurableObject } from 'cloudflare:workers';
import { LibraryApplication, json, baseURL, readBody } from './worker-app.mjs';
import schema from './openapi.json';

export class Library extends DurableObject {
  constructor(ctx,env) { super(ctx,env); this.app=new LibraryApplication(ctx,env); }
  fetch(request) { return this.app.fetch(request); }
  alarm() { return this.app.alarm(); }
}

export default {
  async fetch(request,env) {
    try {
      const url=new URL(request.url),path=url.pathname;
      if(request.method==='GET'&&path==='/openapi.json')return json({...schema,servers:[{url:baseURL(env,request)}]});
      if(path.startsWith('/api/')||path==='/auth/google'||path==='/oauth/callback') {
        // Finish reading the incoming stream before crossing the Durable Object boundary.
        // An early authorization response must not leave the original stream in flight.
        const forwarded=request.body?new Request(request,{body:JSON.stringify(await readBody(request))}):request;
        return env.LIBRARY.get(env.LIBRARY.idFromName('owner-library-v1')).fetch(forwarded);
      }
      if(['GET','HEAD'].includes(request.method)&&['/','/index.html','/app.js','/style.css','/fonts/noto-sans-thai-thai.woff2','/fonts/noto-sans-thai-latin.woff2'].includes(path)) {
        const response=await env.ASSETS.fetch(request);const headers=new Headers(response.headers);
        headers.set('Content-Security-Policy',"default-src 'self'; style-src 'self'; font-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");headers.set('X-Content-Type-Options','nosniff');headers.set('Referrer-Policy','no-referrer');headers.set('Cache-Control','no-store');return new Response(response.body,{status:response.status,headers});
      }
      return json({error:'ไม่พบหน้าที่ต้องการ'},404);
    }catch(e){return json({error:e.status?e.message:'ระบบทำรายการไม่สำเร็จ กรุณาตรวจสอบการตั้งค่า'},e.status||500);}
  }
};
