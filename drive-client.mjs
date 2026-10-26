import { Buffer } from 'node:buffer';
import { randomBytes, createHash } from 'node:crypto';
import { fileName, parseUpload } from './library.mjs';
const problem=(message,status=400)=>Object.assign(new Error(message),{status});
export function createDriveClient(getAccess) {
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
return {listFiles,upload};
}
