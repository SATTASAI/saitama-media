const $ = id => document.getElementById(id);
const subjects = ['คณิตศาสตร์','ภาษาไทย','ภาษาอังกฤษ','วิทยาศาสตร์','สังคมศึกษา','ศิลปะ','สุขศึกษา','การงานอาชีพ','ทั่วไป'];
const grades = ['อนุบาล',...Array.from({length:6},(_,i)=>`ป.${i+1}`),...Array.from({length:6},(_,i)=>`ม.${i+1}`),'ไม่ระบุชั้น'];
const types = ['ใบงาน','สื่อการสอน','แบบฝึกหัด'];
const state = {status:null,files:[],category:'ทั้งหมด',queue:[],selected:null,busy:false,adding:false,loading:false,readFailed:false,page:0,tablePage:0};
const previews = new Map();
const colorScheme = matchMedia('(prefers-color-scheme: dark)');
const compact = matchMedia('(max-width: 1100px)');
let themePreference='system';
try { themePreference=localStorage.getItem('kru-theme')||'system'; } catch {}
if(!['system','light','dark'].includes(themePreference))themePreference='system';
function applyTheme(){document.documentElement.dataset.theme=themePreference==='system'?(colorScheme.matches?'dark':'light'):themePreference;}
applyTheme();
colorScheme.addEventListener('change',()=>{if(themePreference==='system')applyTheme();});
$('theme-select').value=themePreference;
$('theme-select').addEventListener('change',e=>{themePreference=e.target.value;try{localStorage.setItem('kru-theme',themePreference);}catch{}applyTheme();});
function el(tag,cls,text){const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;}
function icon(name){const n=el('img','ui-icon');n.src='/icons/'+name+'.svg';n.alt='';n.setAttribute('aria-hidden','true');return n;}
function options(select,values){for(const v of values){const o=el('option',null,v);o.value=v;select.append(o);}}
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function notice(message,error=false){$('notice').textContent=message;$('notice').hidden=!message;$('notice').classList.toggle('error',error);}
async function api(path,body){
  const response=await fetch(path,{cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  let data;try{data=await response.json();}catch{throw new Error('ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ');}
  if(!response.ok)throw new Error(data.error||'ทำรายการไม่สำเร็จ');return data;
}
function connect(){if(!state.status?.configured)$('setup-dialog').showModal();else location.assign('/auth/google');}
function updateStatus(){
  const s=state.status,ready=s?.signedIn&&s.connected;
  $('drive-status').textContent=ready?'เชื่อม Google Drive แล้ว':'ยังไม่ได้เชื่อม Google Drive';
  $('sidebar-connect').textContent=ready?s.email:'เชื่อมต่อบัญชี';
  $('setup-state').textContent=!s?.configured?'ยังไม่ตั้งค่าเซิร์ฟเวอร์ · ตั้งค่า Google OAuth ก่อนเริ่มใช้งาน':ready?'เชื่อมต่อแล้ว: '+s.email:'เข้าสู่ระบบเพื่อเปิดคลังส่วนตัว';
  $('setup-connect').hidden=!s?.configured;$('setup-connect').textContent=ready?'เชื่อม Google ใหม่':'เชื่อม Google Drive';$('logout').hidden=!s?.signedIn;
}
function mountUploadPanel(){
  if(compact.matches){if($('upload-panel').parentElement!==$('upload-dialog'))$('upload-dialog').append($('upload-panel'));}
  else{if($('upload-dialog').open)$('upload-dialog').close();$('upload-desktop-host').append($('upload-panel'));}
}
mountUploadPanel();compact.addEventListener('change',mountUploadPanel);
function startUpload(){
  if(!state.status?.signedIn)return connect();
  if(compact.matches){if(!$('upload-dialog').open)$('upload-dialog').showModal();}
  else $('file-input').click();
}
function chooseFiles(){if(state.busy||state.adding)return;if(!state.status?.signedIn)return connect();$('file-input').click();}
function closeUpload(){if(state.busy||state.adding)return;if($('upload-dialog').open)$('upload-dialog').close();}
function fileMeta(f){return {title:f.appProperties?.title||f.name,subject:f.appProperties?.subject||'ทั่วไป',grade:f.appProperties?.grade||'ไม่ระบุชั้น',type:f.appProperties?.type||(/แบบฝึก|exercise|practice/i.test(f.name)?'แบบฝึกหัด':/\.(pptx|html|png|jpe?g|webp)$/i.test(f.name)?'สื่อการสอน':'ใบงาน')};}
function dateLabel(f){const d=new Date(f.createdTime);return Number.isNaN(d.valueOf())?'ไม่ระบุวันที่':d.toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'numeric'});}
function driveLink(f){const a=el('a','drive-link');a.href='https://drive.google.com/file/d/'+encodeURIComponent(f.id)+'/view';a.target='_blank';a.rel='noopener noreferrer';return a;}
function extension(f){return f.name.split('.').pop().toUpperCase();}
function previewURL(f){
  if(previews.has(f.id))return previews.get(f.id);
  if(typeof f.thumbnailUrl!=='string')return null;
  try{const u=new URL(f.thumbnailUrl,location.origin);return u.origin===location.origin&&u.pathname.startsWith('/assets/')?u.href:null;}catch{return null;}
}
function cover(f){
  const wrap=el('div','file-preview'),url=previewURL(f);
  if(url){const img=el('img','cover-image');img.src=url;img.alt='ภาพปก '+fileMeta(f).title;img.loading='lazy';img.addEventListener('error',()=>{img.remove();wrap.classList.add('no-preview');wrap.append(icon('file-text'),el('span',null,extension(f)),el('small',null,'ไม่มีภาพตัวอย่าง'));},{once:true});wrap.append(img);}
  else{wrap.classList.add('no-preview');wrap.append(icon('file-text'),el('span',null,extension(f)),el('small',null,'ไม่มีภาพตัวอย่าง'));}
  return wrap;
}
function filteredFiles(){
  const query=$('search').value.trim().toLocaleLowerCase('th'),format=$('format-filter').value;
  const filtered=state.files.filter(f=>{const m=fileMeta(f);return(state.category==='ทั้งหมด'||m.type===state.category)&&(!$('subject-filter').value||m.subject===$('subject-filter').value)&&(!$('grade-filter').value||m.grade===$('grade-filter').value)&&(!format||(format==='image'?/\.(png|jpe?g|webp)$/i.test(f.name):format==='text'?/\.(txt|md|html)$/i.test(f.name):f.name.toLowerCase().endsWith('.'+format)))&&(!query||[f.name,...Object.values(m)].join(' ').toLocaleLowerCase('th').includes(query));});
  return filtered.sort((a,b)=>$('sort').value==='name'?fileMeta(a).title.localeCompare(fileMeta(b).title,'th'):$('sort').value==='oldest'?new Date(a.createdTime)-new Date(b.createdTime):new Date(b.createdTime)-new Date(a.createdTime));
}
function updatePages(){const total=$('file-grid').children.length;$('page-status').textContent=`หน้า ${total?state.page+1:0} / ${total}`;$('page-prev').disabled=state.page<=0;$('page-next').disabled=state.page>=total-1;}
function goPage(delta){state.page=Math.max(0,Math.min($('file-grid').children.length-1,state.page+delta));updatePages();$('file-grid').scrollTo({left:state.page*$('file-grid').clientWidth,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});}
function renderTable(files){
  const pageSize=5,total=Math.ceil(files.length/pageSize);state.tablePage=Math.min(state.tablePage,Math.max(0,total-1));$('file-table-body').replaceChildren();
  for(const f of files.slice(state.tablePage*pageSize,(state.tablePage+1)*pageSize)){
    const m=fileMeta(f),tr=el('tr'),name=el('td','table-name'),link=driveLink(f),badge=el('span','file-extension',extension(f));
    link.append(badge,el('span',null,m.title));name.append(link);tr.append(name,...[m.subject,m.grade,m.type,dateLabel(f)].map(value=>el('td',null,value)));
    const last=el('td'),open=driveLink(f);open.setAttribute('aria-label','เปิด '+m.title+' ใน Google Drive');open.append(icon('arrow-square-out'));last.append(open);tr.append(last);$('file-table-body').append(tr);
  }
  $('table-status').textContent=files.length?`${state.tablePage*pageSize+1}–${Math.min(files.length,(state.tablePage+1)*pageSize)} จาก ${files.length} รายการ`:'';
  $('table-prev').disabled=state.tablePage===0;$('table-next').disabled=state.tablePage>=total-1;$('file-table-section').hidden=!files.length;
}
function render(){
  $('all-count').textContent=state.files.length;$('stat-total').textContent=state.files.length;
  for(const [id,type] of [['stat-worksheet','ใบงาน'],['stat-exercise','แบบฝึกหัด'],['stat-media','สื่อการสอน']])$(id).textContent=state.files.filter(f=>fileMeta(f).type===type).length;
  const files=filteredFiles();$('result-count').textContent=files.length;
  $('section-title').firstChild.textContent=state.category==='ทั้งหมด'?'สื่อที่บันทึกไว้ ':state.category+' ';
  const perPage=matchMedia('(max-width:600px)').matches?1:matchMedia('(max-width:760px)').matches?2:3;
  state.page=Math.min(state.page,Math.max(0,Math.ceil(files.length/perPage)-1));$('file-grid').replaceChildren();let page;
  files.forEach((f,index)=>{
    if(index%perPage===0){page=el('div','file-page');page.setAttribute('role','group');page.setAttribute('aria-label','หน้าที่ '+(Math.floor(index/perPage)+1));$('file-grid').append(page);}
    const m=fileMeta(f),card=el('article','file-card'),coverLink=driveLink(f);coverLink.className='cover-link';coverLink.setAttribute('aria-label','เปิด '+m.title);coverLink.append(cover(f));
    const titleLink=driveLink(f);titleLink.className='file-title';titleLink.append(el('h3',null,m.title));const tags=el('div','file-meta');[m.subject,m.grade,m.type].forEach(v=>tags.append(el('span',null,v)));card.append(coverLink,titleLink,tags);page.append(card);
  });
  $('file-grid').hidden=!files.length;$('carousel-nav').hidden=files.length<=perPage;$('empty-state').hidden=!!files.length;updatePages();$('file-grid').scrollLeft=state.page*$('file-grid').clientWidth;renderTable(files);
  $('empty-action').hidden=false;
  if(state.loading){$('empty-title').textContent='กำลังอ่านคลังสื่อ…';$('empty-description').textContent='กำลังโหลดรายการจาก Google Drive';$('empty-action').hidden=true;}
  else if(state.readFailed&&!state.files.length){$('empty-title').textContent='ยังอ่านคลังสื่อไม่ได้';$('empty-description').textContent='ตรวจสอบการเชื่อมต่อ แล้วลองรีเฟรชอีกครั้ง';$('empty-action').textContent='รีเฟรชรายการ';}
  else if(!state.status?.signedIn){$('empty-title').textContent='พื้นที่สำหรับสื่อดี ๆ ของคุณ';$('empty-description').textContent='เชื่อม Google Drive เพื่อเปิดคลังสื่อส่วนตัว';$('empty-action').textContent='เชื่อม Google Drive';}
  else if(!state.files.length){$('empty-title').textContent='พร้อมเก็บสื่อชิ้นแรกแล้ว';$('empty-description').textContent='เลือกไฟล์ แล้วตรวจชื่อและหมวดหมู่ก่อนบันทึก';$('empty-action').textContent='เพิ่มสื่อชิ้นแรก';}
  else{$('empty-title').textContent='ยังไม่พบสื่อที่ค้นหา';$('empty-description').textContent='ลองเปลี่ยนคำค้น วิชา หรือระดับชั้น';$('empty-action').textContent='ล้างตัวกรอง';}
}
async function refresh(){
  if(state.loading)return;state.loading=true;$('refresh').disabled=true;render();
  try{const previous=state.status?.email;state.status=await api('/api/status');updateStatus();if(previous!==state.status.email)state.files=[];
    if(state.status.signedIn){state.files=(await api('/api/files')).files;state.readFailed=false;notice('');}
    else{state.files=[];state.readFailed=false;notice(state.status.configured?'เข้าสู่ระบบด้วย Google เพื่อเปิดคลังสื่อของคุณ':'ตั้งค่า Google OAuth เพื่อเริ่มใช้งาน ดูรายละเอียดที่ “ตั้งค่าระบบ”');}
  }catch(e){state.readFailed=true;notice(e.message+(state.files.length?' · กำลังแสดงข้อมูลก่อนรีเฟรช':''),true);}
  finally{state.loading=false;$('refresh').disabled=false;render();}
}
function asBase64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('อ่านไฟล์ไม่สำเร็จ'));reader.readAsDataURL(file);});}
function requestId(){return typeof crypto.randomUUID==='function'?crypto.randomUUID():Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,'0')).join('');}
function releaseItem(item){if(item.preview&&!item.done)URL.revokeObjectURL(item.preview);}
async function addFiles(list){
  if(state.busy||state.adding)return;if(!state.status?.signedIn)return connect();state.adding=true;renderQueue();const rejected=[];
  try{for(const file of Array.from(list)){
    if(state.queue.some(i=>i.file.name===file.name&&i.file.size===file.size&&i.file.lastModified===file.lastModified)){rejected.push(file.name+' อยู่ในรายการแล้ว');continue;}
    if(!file.size){rejected.push(file.name+' เป็นไฟล์ว่าง');continue;}
    if(file.size>15*1024*1024){rejected.push(file.name+' มีขนาดเกิน 15 MB');continue;}
    if(!/\.(pdf|docx|pptx|xlsx|png|jpe?g|webp|txt|md|html)$/i.test(file.name)){rejected.push('ไม่รองรับไฟล์ '+file.name);continue;}
    try{const image=/\.(png|jpe?g|webp)$/i.test(file.name),result=await api('/api/classify',{name:file.name,...(!image?{content_base64:await asBase64(file)}:{})});const {analysis,...meta}=result;
      const item={file,meta,analysis,id:requestId(),done:false,uncertain:false,status:'พร้อมบันทึก',preview:image?URL.createObjectURL(file):null};state.queue.push(item);state.selected=item.id;
    }catch(e){rejected.push(file.name+': '+e.message);}
  }}finally{state.adding=false;$('file-input').value='';$('upload-error').hidden=!rejected.length;$('upload-error').textContent=rejected.join(' · ');renderQueue();}
}
function renderQueue(){
  $('upload-list').replaceChildren();$('upload-editor').replaceChildren();$('queue-count').textContent=state.queue.length+' รายการ';
  if(!state.queue.some(i=>i.id===state.selected))state.selected=state.queue[0]?.id||null;
  for(const item of state.queue){const row=el('div','upload-item'+(state.selected===item.id?' selected':'')+(item.done?' is-done':'')),select=el('button','queue-file'),ext=el('span','file-extension',item.file.name.split('.').pop().toUpperCase());select.type='button';select.setAttribute('aria-pressed',String(item.id===state.selected));select.disabled=state.busy||state.adding;
    const copy=el('span','queue-file-copy');copy.append(el('strong',null,item.file.name),el('small',null,(item.file.size/1024/1024).toFixed(2)+' MB · '+item.status));select.append(ext,copy);select.addEventListener('click',()=>{state.selected=item.id;renderQueue();});
    const remove=el('button','icon-button');remove.type='button';remove.setAttribute('aria-label','นำ '+item.file.name+' ออกจากรายการ');remove.append(icon('x'));remove.disabled=state.busy||state.adding;remove.addEventListener('click',()=>{releaseItem(item);state.queue=state.queue.filter(i=>i!==item);renderQueue();});row.append(select,remove);$('upload-list').append(row);
  }
  const item=state.queue.find(i=>i.id===state.selected);
  if(item){const editor=$('upload-editor');editor.append(el('h3',null,'ตรวจชื่อและหมวดหมู่ก่อนบันทึก'));const original=el('label','original-name','ชื่อไฟล์เดิม (จากเครื่องของคุณ)'),originalInput=el('input');originalInput.value=item.file.name;originalInput.readOnly=true;original.append(originalInput);editor.append(original);
    const fields=el('div','upload-fields');for(const [key,label,values] of [['title','ชื่อสื่อ (แนะนำ)',null],['subject','วิชา',subjects],['grade','ระดับชั้น',grades],['type','หมวดหมู่',types]]){const wrap=el('label',key==='title'?'title-field':key==='type'?'type-field':'',label),input=el(values?'select':'input');if(values)options(input,values);else input.maxLength=180;input.value=item.meta[key];input.disabled=state.busy||state.adding||item.done||item.uncertain;input.addEventListener(values?'change':'input',()=>{item.meta[key]=input.value;});wrap.append(input);fields.append(wrap);}
    editor.append(fields);const note=el('p','analysis-note');note.append(icon(item.analysis?.source==='content'?'check-circle':'file-text'),el('span',null,item.analysis?.detail||'แนะนำจากชื่อไฟล์ · ตรวจสอบก่อนบันทึก'));editor.append(note);if(item.uncertain||item.done)editor.append(el('p','upload-progress'+(item.done?' success':''),item.status));
  }else $('upload-list').append(el('p','queue-empty',state.adding?'กำลังตรวจสอบไฟล์…':'ยังไม่ได้เลือกไฟล์'));
  $('queue-summary').textContent=state.adding?'กำลังตรวจสอบไฟล์…':`${state.queue.length} ไฟล์ · บันทึกแล้ว ${state.queue.filter(i=>i.done).length}`;
  const locked=state.busy||state.adding;for(const id of ['file-input','pick-more','cancel-upload','mobile-upload-close'])$(id).disabled=locked;
  $('dropzone').setAttribute('aria-disabled',String(locked));$('submit-upload').disabled=locked||!state.queue.some(i=>!i.done);$('submit-upload').replaceChildren(icon('upload-simple'),el('span',null,state.busy?'กำลังบันทึก…':state.adding?'กำลังตรวจไฟล์…':'บันทึกเข้าคลัง'));$('cancel-upload').hidden=!state.queue.length;
}
async function submitUpload(){
  if(state.busy||state.adding)return;
  const pending=state.queue.filter(i=>!i.done);if(!pending.length)return;
  const invalid=pending.find(i=>!i.meta.title.trim());if(invalid){state.selected=invalid.id;renderQueue();$('upload-error').textContent='กรุณาระบุชื่อสื่อก่อนบันทึก';$('upload-error').hidden=false;return;}
  state.busy=true;$('upload-error').hidden=true;renderQueue();let successes=0;
  for(const item of pending){try{item.status='กำลังส่งไฟล์…';renderQueue();const content_base64=await asBase64(item.file);item.uncertain=true;const result=await api('/api/upload',{name:item.file.name,metadata:item.meta,content_base64,request_id:item.id});if(item.preview&&result.file?.id)previews.set(result.file.id,item.preview);item.done=true;item.uncertain=false;item.status='บันทึกแล้ว';successes++;}
    catch(e){item.status='ยังไม่ยืนยันผล · '+e.message;$('upload-error').textContent='บางไฟล์ยังไม่ยืนยันผล คุณกดบันทึกซ้ำได้ ระบบใช้คำขอเดิมเพื่อตรวจไฟล์ซ้ำ';$('upload-error').hidden=false;}renderQueue();}
  state.busy=false;renderQueue();if(successes){toast('บันทึกสื่อแล้ว '+successes+' รายการ');await refresh();}
}
function resetFilters(){for(const id of ['search','subject-filter','grade-filter','format-filter'])$(id).value='';state.category='ทั้งหมด';state.page=0;state.tablePage=0;syncCategories();render();}
function syncCategories(){document.querySelectorAll('[data-category]').forEach(b=>{const active=b.dataset.category===state.category;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});}
options($('subject-filter'),subjects);options($('grade-filter'),grades);
for(const id of ['search','subject-filter','grade-filter','format-filter','sort'])$(id).addEventListener(id==='search'?'input':'change',()=>{state.page=0;state.tablePage=0;render();});
document.querySelectorAll('[data-category]').forEach(b=>b.addEventListener('click',()=>{state.category=b.dataset.category;state.page=0;state.tablePage=0;syncCategories();render();}));
$('filter-toggle').addEventListener('click',()=>{const open=$('extra-filters').hidden;$('extra-filters').hidden=!open;$('filter-toggle').setAttribute('aria-expanded',String(open));});$('clear-filters').addEventListener('click',resetFilters);
$('page-prev').addEventListener('click',()=>goPage(-1));$('page-next').addEventListener('click',()=>goPage(1));
$('file-grid').addEventListener('keydown',e=>{if(e.target===$('file-grid')&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();goPage(e.key==='ArrowLeft'?-1:1);}});
let scrollTimer;$('file-grid').addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{state.page=Math.max(0,Math.min($('file-grid').children.length-1,Math.round($('file-grid').scrollLeft/Math.max(1,$('file-grid').clientWidth))));updatePages();},180);});
let resizeTimer,width=innerWidth;addEventListener('resize',()=>{if(innerWidth===width){$('file-grid').scrollLeft=state.page*$('file-grid').clientWidth;return;}width=innerWidth;clearTimeout(resizeTimer);resizeTimer=setTimeout(render,150);});
for(const [id,delta] of [['table-prev',-1],['table-next',1]])$(id).addEventListener('click',()=>{state.tablePage=Math.max(0,state.tablePage+delta);renderTable(filteredFiles());});
for(const id of ['setup-nav','sidebar-connect','help'])$(id).addEventListener('click',()=>$('setup-dialog').showModal());
$('automation-nav').addEventListener('click',()=>$('automation-dialog').showModal());document.querySelectorAll('.close-dialog').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
$('upload-button').addEventListener('click',startUpload);$('mobile-upload-close').addEventListener('click',closeUpload);$('upload-dialog').addEventListener('cancel',e=>{if(state.busy||state.adding)e.preventDefault();});
$('refresh').addEventListener('click',refresh);$('empty-action').addEventListener('click',()=>{if(state.readFailed)return refresh();if(!state.status?.signedIn)return connect();if(!state.files.length)return startUpload();resetFilters();});
$('file-input').addEventListener('change',e=>addFiles(e.target.files));$('file-input').addEventListener('click',e=>{if(!state.status?.signedIn){e.preventDefault();connect();}});$('pick-more').addEventListener('click',chooseFiles);$('dropzone').addEventListener('click',chooseFiles);$('dropzone').addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();chooseFiles();}});$('submit-upload').addEventListener('click',submitUpload);
$('cancel-upload').addEventListener('click',()=>{if(state.busy||state.adding)return;for(const i of state.queue)releaseItem(i);state.queue=[];state.selected=null;$('upload-error').hidden=true;renderQueue();});
let depth=0;const dropzone=$('dropzone');dropzone.addEventListener('dragenter',e=>{e.preventDefault();depth++;dropzone.classList.add('drag');});dropzone.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect=state.busy||state.adding?'none':'copy';});dropzone.addEventListener('dragleave',()=>{if(--depth<=0){depth=0;dropzone.classList.remove('drag');}});dropzone.addEventListener('drop',e=>{e.preventDefault();depth=0;dropzone.classList.remove('drag');addFiles(e.dataTransfer.files);});
for(const event of ['dragover','drop'])addEventListener(event,e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
$('schema-url').value=location.origin+'/openapi.json';$('copy-schema').addEventListener('click',async()=>{try{await navigator.clipboard.writeText($('schema-url').value);toast('คัดลอกลิงก์ OpenAPI แล้ว');}catch{toast('เลือกและคัดลอกลิงก์ในช่องได้เลย');}});
$('logout').addEventListener('click',async()=>{try{await api('/api/logout',{});for(const item of state.queue)releaseItem(item);for(const url of previews.values())URL.revokeObjectURL(url);previews.clear();state.files=[];state.queue=[];renderQueue();$('setup-dialog').close();await refresh();}catch(e){toast(e.message);}});
if(new URLSearchParams(location.search).get('auth')==='cancelled'){toast('ยกเลิกการเชื่อม Google แล้ว');history.replaceState(null,'','/');}
renderQueue();refresh();
