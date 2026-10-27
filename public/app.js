const $ = id => document.getElementById(id);
const colorScheme=window.matchMedia('(prefers-color-scheme: dark)');
let themePreference='system';try{themePreference=localStorage.getItem('kru-theme')||'system';}catch{}
if(!['system','light','dark'].includes(themePreference))themePreference='system';
function applyTheme(){document.documentElement.dataset.theme=themePreference==='system'?(colorScheme.matches?'dark':'light'):themePreference;}
applyTheme();colorScheme.addEventListener('change',()=>{if(themePreference==='system')applyTheme();});
$('theme-select').value=themePreference;
$('theme-select').addEventListener('change',e=>{themePreference=e.target.value;try{localStorage.setItem('kru-theme',themePreference);}catch{}applyTheme();});
const state = { status:null, files:[], category:'ทั้งหมด', queue:[], busy:false, loading:false, readFailed:false, page:0 };
const subjects = ['คณิตศาสตร์','ภาษาไทย','ภาษาอังกฤษ','วิทยาศาสตร์','สังคมศึกษา','ศิลปะ','สุขศึกษา','การงานอาชีพ','ทั่วไป'];
const grades = ['อนุบาล',...Array.from({length:6},(_,i)=>`ป.${i+1}`),...Array.from({length:6},(_,i)=>`ม.${i+1}`),'ไม่ระบุชั้น'];
const types = ['ใบงาน','สื่อการสอน','แบบฝึกหัด'];
function el(tag,cls,text) {const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function options(select,values) {values.forEach(v=>{const o=el('option',null,v);o.value=v;select.append(o);});}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function notice(message,error=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').classList.toggle('error',error);}
async function api(path,body) {
  const r=await fetch(path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  let data;try{data=await r.json();}catch{throw new Error('ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ');}
  if(!r.ok)throw new Error(data.error||'ทำรายการไม่สำเร็จ');return data;
}
function openDialog(id){$(id).showModal();}
function connect(){if(!state.status?.configured)openDialog('setup-dialog');else window.location.assign('/auth/google');}
function updateStatus(){
  const s=state.status;const ready=s?.signedIn && s.connected;
  $('drive-status').textContent=ready?'เชื่อมต่อแล้ว · '+s.email:'ยังไม่ได้เข้าสู่ระบบ';
  $('sidebar-connect').textContent=ready?'จัดการการเชื่อมต่อ →':'เชื่อมต่อบัญชี →';
  $('welcome-connect').textContent=ready?'อัปโหลดสื่อชิ้นถัดไป ↗':'เริ่มเชื่อมต่อ Google Drive ↗';
  $('setup-state').textContent=!s?.configured?'ยังไม่ตั้งค่าเซิร์ฟเวอร์ · ต้องตั้งค่า Google OAuth ก่อนเริ่มใช้งาน':ready?'เชื่อมต่อ Google Drive แล้ว: '+s.email:'เซิร์ฟเวอร์พร้อมแล้ว · เข้าสู่ระบบเพื่อเปิดคลังส่วนตัว';
  $('setup-connect').hidden=!s?.configured;
  $('setup-connect').textContent=ready?'เชื่อม Google ใหม่':'เชื่อม Google Drive →';
  $('logout').hidden=!s?.signedIn;
}
function fileMeta(f){return {title:f.appProperties?.title||f.name,subject:f.appProperties?.subject||'ทั่วไป',grade:f.appProperties?.grade||'ไม่ระบุชั้น',type:f.appProperties?.type||(/\.(pptx|html|png|jpe?g|webp)$/i.test(f.name)?'สื่อการสอน':/แบบฝึก|exercise|practice/i.test(f.name)?'แบบฝึกหัด':'ใบงาน')};}
function updatePages(){
  const total=$('file-grid').children.length;
  $('page-status').textContent=`หน้า ${total?state.page+1:0} / ${total}`;
  $('page-prev').disabled=state.page<=0;$('page-next').disabled=state.page>=total-1;
}
function goPage(delta){
  state.page=Math.max(0,Math.min($('file-grid').children.length-1,state.page+delta));updatePages();
  $('file-grid').scrollTo({left:state.page*$('file-grid').clientWidth,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
}
$('page-prev').addEventListener('click',()=>goPage(-1));$('page-next').addEventListener('click',()=>goPage(1));
$('file-grid').addEventListener('keydown',e=>{if(e.target!==$('file-grid'))return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();goPage(e.key==='ArrowLeft'?-1:1);}});
let scrollTimer;
$('file-grid').addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{state.page=Math.round($('file-grid').scrollLeft/Math.max(1,$('file-grid').clientWidth));updatePages();},120);});
let resizeTimer,layoutWidth=window.innerWidth;
window.addEventListener('resize',()=>{if(window.innerWidth===layoutWidth){$('file-grid').scrollLeft=state.page*$('file-grid').clientWidth;return;}layoutWidth=window.innerWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(render,150);});
function render(){
  const files=state.files,query=$('search').value.trim().toLocaleLowerCase('th');
  $('stat-total').textContent=files.length;$('all-count').textContent=files.length;
  ['worksheet','media','exercise'].forEach((key,i)=>$('stat-'+key).textContent=files.filter(f=>fileMeta(f).type===types[i]).length);
  const format=$('format-filter').value;
  const filtered=files.filter(f=>{const m=fileMeta(f);return(state.category==='ทั้งหมด'||m.type===state.category)&&(!$('subject-filter').value||m.subject===$('subject-filter').value)&&(!$('grade-filter').value||m.grade===$('grade-filter').value)&&(!format||(format==='image'?/\.(png|jpe?g|webp)$/i.test(f.name):format==='text'?/\.(txt|md|html)$/i.test(f.name):f.name.toLowerCase().endsWith('.'+format)))&&(!query||[f.name,...Object.values(m)].join(' ').toLocaleLowerCase('th').includes(query));});
  filtered.sort((a,b)=>$('sort').value==='name'?fileMeta(a).title.localeCompare(fileMeta(b).title,'th'):$('sort').value==='oldest'?new Date(a.createdTime)-new Date(b.createdTime):new Date(b.createdTime)-new Date(a.createdTime));
  const category=state.category==='ทั้งหมด'?'สื่อทั้งหมด':state.category;
  $('section-title').firstChild.textContent=category+' ';$('breadcrumb').textContent=category;$('result-count').textContent=filtered.length;
  $('file-grid').replaceChildren();
  const perPage=window.matchMedia('(max-width:600px)').matches?1:window.matchMedia('(max-width:1100px)').matches?4:6;
  state.page=Math.min(state.page,Math.max(0,Math.ceil(filtered.length/perPage)-1));
  let page;
  filtered.forEach((f,index)=>{
    if(index%perPage===0){page=el('div','file-page');page.setAttribute('role','group');page.setAttribute('aria-label','หน้าที่ '+(Math.floor(index/perPage)+1));$('file-grid').append(page);}
    const m=fileMeta(f),card=el('article','file-card'),preview=el('div','file-preview'),doc=el('div','doc',m.type==='สื่อการสอน'?'◈':m.type==='แบบฝึกหัด'?'✎':'▧');
    preview.dataset.type=m.type;preview.setAttribute('aria-hidden','true');
    const sheet=el('div','preview-sheet');sheet.append(doc,el('span','preview-title',m.title),el('span','preview-lines',''));preview.append(sheet,el('span','extension',f.name.split('.').pop().toUpperCase()),el('span','preview-kind',m.type));
    const body=el('div','file-body');body.append(el('h3',null,m.title));const tags=el('div','file-meta');[m.subject,m.grade,m.type].forEach(v=>tags.append(el('span',null,v)));body.append(tags);
    const bottom=el('div','file-bottom');bottom.append(el('span',null,new Date(f.createdTime).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'})));
    const link=el('a',null,'เปิดใน Drive ↗');link.href='https://drive.google.com/file/d/'+encodeURIComponent(f.id)+'/view';link.target='_blank';link.rel='noopener noreferrer';bottom.append(link);body.append(bottom);card.append(preview,body);page.append(card);
  });
  $('file-grid').hidden=!filtered.length;
  $('carousel-nav').hidden=!filtered.length;
  updatePages();
  $('file-grid').scrollLeft=state.page*$('file-grid').clientWidth;
  $('empty-state').hidden=filtered.length>0;
  $('empty-action').hidden=false;
  if(state.loading){$('empty-title').textContent='กำลังอ่านคลังสื่อ…';$('empty-description').textContent='กำลังโหลดรายการจาก Google Drive';$('empty-action').hidden=true;}
  else if(state.readFailed && !files.length){$('empty-title').textContent='ยังอ่านคลังสื่อไม่ได้';$('empty-description').textContent='ตรวจสอบข้อความแจ้งเตือน แล้วกดรีเฟรชเพื่อลองอ่านใหม่';$('empty-action').textContent='รีเฟรชรายการ';}
  else if(!state.status?.signedIn){$('empty-title').textContent='เริ่มต้นคลังสื่อของคุณ';$('empty-description').textContent='เชื่อม Google Drive แล้วอัปโหลดสื่อชิ้นแรก เราจะช่วยตั้งชื่อและจัดให้เป็นหมวดหมู่';$('empty-action').textContent='เชื่อม Google Drive →';}
  else if(!files.length){$('empty-title').textContent='พร้อมเก็บสื่อชิ้นแรกแล้ว';$('empty-description').textContent='เลือกไฟล์จากเครื่อง แล้วตรวจชื่อและหมวดหมู่ก่อนบันทึก';$('empty-action').textContent='+ อัปโหลดสื่อชิ้นแรก';}
  else{$('empty-title').textContent='ยังไม่พบสื่อที่ค้นหา';$('empty-description').textContent='ลองเปลี่ยนคำค้น วิชา หรือระดับชั้น';$('empty-action').textContent='ล้างตัวกรอง';}
}
async function refresh(){
  if(state.loading)return;
  state.loading=true;$('refresh').disabled=true;render();
  try{
    const previousEmail=state.status?.email;
    state.status=await api('/api/status');updateStatus();
    if(previousEmail!==state.status.email)state.files=[];
    if(state.status.signedIn){const d=await api('/api/files');state.files=d.files;state.readFailed=false;notice('');}
    else{state.files=[];state.readFailed=false;if(!state.status.configured)notice('ตั้งค่า Google OAuth ในเซิร์ฟเวอร์เพื่อเริ่มใช้งาน ดูขั้นตอนที่ “ตั้งค่าระบบ”');else notice('เข้าสู่ระบบด้วย Google เพื่อเปิดคลังสื่อของคุณ');}
  }catch(e){state.readFailed=true;notice(e.message+(state.files.length?' · รายการที่แสดงเป็นข้อมูลก่อนรีเฟรช':''),true);}
  finally{state.loading=false;$('refresh').disabled=false;render();}
}
function startUpload(){if(!state.status?.signedIn)return connect();openDialog('upload-dialog');}
async function addFiles(list){
  if(state.busy||state.adding)return;
  state.adding=true;renderQueue();const rejected=[];
  for(const file of Array.from(list)){
    if(state.queue.some(i=>i.file.name===file.name&&i.file.size===file.size&&i.file.lastModified===file.lastModified)){rejected.push(file.name+' อยู่ในรายการแล้ว');continue;}
    if(file.size>15*1024*1024){rejected.push(file.name+' มีขนาดเกิน 15 MB');continue;}
    if(!/\.(pdf|docx|pptx|xlsx|png|jpe?g|webp|txt|md|html)$/i.test(file.name)){rejected.push('ไม่รองรับไฟล์ '+file.name);continue;}
    if(!file.size){rejected.push('ไฟล์ '+file.name+' ว่างเปล่า');continue;}
    try{
      const {analysis,...meta}=await api('/api/classify',{name:file.name,content_base64:await asBase64(file)});
      state.queue.push({file,meta,analysis,id:crypto.randomUUID(),status:'พร้อมอัปโหลด',done:false,uncertain:false});
    }catch(e){rejected.push(file.name+': '+e.message);}
  }
  state.adding=false;$('upload-error').hidden=!rejected.length;$('upload-error').textContent=rejected.join(' · ');
  renderQueue();$('file-input').value='';
}
function renderQueue(){
  $('upload-list').replaceChildren();
  for(const item of state.queue){
    const row=el('div','upload-item'+(item.done?' is-done':item.uncertain?' is-uncertain':'')),heading=el('div','item-heading');heading.append(el('strong',null,item.file.name+' · '+(item.file.size/1024/1024).toFixed(2)+' MB'));
    const remove=el('button',null,'นำออก');remove.disabled=state.busy||state.adding;remove.type='button';remove.addEventListener('click',()=>{state.queue=state.queue.filter(x=>x!==item);renderQueue();});heading.append(remove);row.append(heading);
    const fields=el('div','upload-fields');
    for(const [key,label,values] of [['title','ชื่อสื่อ',null],['subject','วิชา',subjects],['grade','ระดับชั้น',grades],['type','ประเภท',types]]){
      const wrap=el('label',key==='title'?'title-field':'',label),input=el(values?'select':'input');
      if(values)options(input,values);else input.maxLength=180;
      input.value=item.meta[key];input.disabled=state.busy||item.done||item.uncertain;
      input.addEventListener('change',()=>{item.meta[key]=input.value;});wrap.append(input);fields.append(wrap);
    }
    const suggestion=el('p','analysis-note',item.analysis?.detail||'แนะนำจากชื่อไฟล์');
    suggestion.prepend(el('span','analysis-badge',item.analysis?.source==='content'?'✧ วิเคราะห์เนื้อหา':'◈ วิเคราะห์ชื่อไฟล์'));
    row.append(suggestion,fields,el('p','upload-progress',item.status));$('upload-list').append(row);
  }
  $('submit-upload').disabled=state.busy||state.adding||!state.queue.some(i=>!i.done);
  $('submit-upload').textContent=state.busy?'กำลังอัปโหลด…':'อัปโหลดเข้า Google Drive';
  $('queue-summary').textContent=state.adding?'กำลังตรวจสอบไฟล์…':state.queue.length+' ไฟล์ · บันทึกแล้ว '+state.queue.filter(i=>i.done).length+' · รอส่ง '+state.queue.filter(i=>!i.done).length;
  $('file-input').disabled=state.busy||state.adding;
  $('upload-dialog').querySelector('.dialog-heading .close-dialog').disabled=state.busy||state.adding;
  $('cancel-upload').disabled=state.busy||state.adding;
}
function asBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('อ่านไฟล์ไม่สำเร็จ'));reader.readAsDataURL(file);});}
async function submitUpload(){
  if(state.busy)return;state.busy=true;$('upload-error').hidden=true;renderQueue();let successes=0;
  for(const item of state.queue.filter(x=>!x.done)){
    try{
      item.status='กำลังส่งไฟล์…';renderQueue();
      const content_base64=await asBase64(item.file);
      item.uncertain=true;
      await api('/api/upload',{name:item.file.name,metadata:item.meta,content_base64,request_id:item.id});
      item.done=true;item.uncertain=false;item.status='✓ บันทึกใน Google Drive แล้ว';successes++;
    }catch(e){item.status='ยังไม่ยืนยันผล · '+e.message;$('upload-error').hidden=false;$('upload-error').textContent='บางไฟล์ยังไม่ยืนยันผล กดรีเฟรชตรวจสอบได้ หรือกดอัปโหลดซ้ำด้วยคำขอเดิม ระบบตรวจไฟล์ซ้ำให้';}
    renderQueue();
  }
  state.busy=false;renderQueue();if(successes){toast('บันทึกสื่อแล้ว '+successes+' รายการ');await refresh();}
}
options($('subject-filter'),subjects);options($('grade-filter'),grades);
for(const id of ['search','subject-filter','grade-filter','format-filter','sort'])$(id).addEventListener(id==='search'?'input':'change',()=>{state.page=0;render();});
document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;state.page=0;document.querySelectorAll('[data-category]').forEach(x=>{x.classList.toggle('active',x.dataset.category===state.category);x.setAttribute('aria-pressed',String(x.dataset.category===state.category));});render();}));
document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>{if(b.closest('dialog').id==='upload-dialog'&&(state.busy||state.adding))return;b.closest('dialog').close();}));
$('upload-dialog').addEventListener('cancel',e=>{if(state.busy||state.adding)e.preventDefault();});
$('upload-button').addEventListener('click',startUpload);
$('welcome-connect').addEventListener('click',()=>state.status?.signedIn?startUpload():connect());
$('sidebar-connect').addEventListener('click',()=>openDialog('setup-dialog'));
$('setup-nav').addEventListener('click',()=>openDialog('setup-dialog'));
$('help').addEventListener('click',()=>openDialog('setup-dialog'));
$('automation-nav').addEventListener('click',()=>openDialog('automation-dialog'));
$('refresh').addEventListener('click',refresh);
$('empty-action').addEventListener('click',()=>{if(state.readFailed)return refresh();if(!state.status?.signedIn)return connect();if(!state.files.length)return startUpload();$('search').value='';$('subject-filter').value='';$('grade-filter').value='';$('format-filter').value='';state.page=0;state.category='ทั้งหมด';document.querySelectorAll('[data-category]').forEach(x=>x.classList.toggle('active',x.dataset.category==='ทั้งหมด'));render();});
$('file-input').addEventListener('change',e=>addFiles(e.target.files));
$('submit-upload').addEventListener('click',submitUpload);
$('quick-drop').addEventListener('click',startUpload);
for(const target of [$('dropzone'),$('quick-drop')]){
  let depth=0;
  target.addEventListener('dragenter',e=>{e.preventDefault();depth++;target.classList.add('drag');});
  target.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect=state.busy||state.adding?'none':'copy';});
  target.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;target.classList.remove('drag');}});
  target.addEventListener('drop',e=>{e.preventDefault();depth=0;target.classList.remove('drag');if(state.busy||state.adding)return;if(!state.status?.signedIn){toast('กรุณาเชื่อม Google ก่อน แล้วลากไฟล์อีกครั้ง');connect();return;}openDialog('upload-dialog');addFiles(e.dataTransfer.files);});
}
// Avoid navigating away when a file is dropped outside the upload area.
for(const event of ['dragover','drop'])window.addEventListener(event,e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
$('schema-url').value=location.origin+'/openapi.json';
$('copy-schema').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('schema-url').value);toast('คัดลอกลิงก์ OpenAPI แล้ว');}catch{toast('เลือกและคัดลอกลิงก์ในช่องได้เลย');}});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout',{});state.files=[];state.queue=[];renderQueue();$('setup-dialog').close();await refresh();}catch(e){toast(e.message);}});
if(new URLSearchParams(location.search).get('auth')==='cancelled'){toast('ยกเลิกการเชื่อม Google แล้ว');history.replaceState(null,'','/');}
refresh();
