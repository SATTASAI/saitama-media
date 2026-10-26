import { randomUUID } from 'node:crypto';
export const subjects = ['คณิตศาสตร์','ภาษาไทย','ภาษาอังกฤษ','วิทยาศาสตร์','สังคมศึกษา','ศิลปะ','สุขศึกษา','การงานอาชีพ','ทั่วไป'];
export const types = ['ใบงาน','สื่อการสอน','แบบฝึกหัด'];
export function classify(name, input = {}) {
  const n = name.normalize('NFC');
  const rules = [ /คณิต|บวก|ลบ|คูณ|หาร|เศษส่วน|math/i, /ภาษาไทย|สระ|พยัญชนะ|อ่าน|thai/i, /อังกฤษ|english|vocab|grammar/i, /วิทย์|วิทยาศาสตร์|science|พืช|สัตว์|แรง/, /สังคม|ประวัติ|ภูมิศาสตร์/, /ศิลปะ|ระบายสี|art/i, /สุขศึกษา|พลศึกษา/, /การงาน|อาชีพ/ ];
  const index = rules.findIndex(r => r.test(n));
  const subject = subjects.includes(input.subject) ? input.subject : (subjects[index] || 'ทั่วไป');
  const match = n.match(/(?:ป\.?|ประถม(?:ศึกษา)?\s*)([1-6])|(?:ม\.?|มัธยม(?:ศึกษา)?\s*)([1-6])/);
  const detectedGrade = match ? (match[1] ? `ป.${match[1]}` : `ม.${match[2]}`) : 'ไม่ระบุชั้น';
  const grade = /^(ป\.[1-6]|ม\.[1-6]|อนุบาล|ไม่ระบุชั้น)$/.test(input.grade || '') ? input.grade : detectedGrade;
  const type = types.includes(input.type) ? input.type : /แบบฝึก|exercise|practice/i.test(n) ? 'แบบฝึกหัด' : /สื่อ|slide|presentation|เกม/i.test(n) ? 'สื่อการสอน' : 'ใบงาน';
  const title = (input.title || n.replace(/\.[a-z0-9]{1,8}$/i, '')).trim().slice(0,180) || 'สื่อไม่มีชื่อ';
  return {title, subject, grade, type};
}
export function safeName(value) { return String(value).normalize('NFC').replace(/[\x00-\x1f/\\:*?"<>|]/g, '-').trim().slice(0,180) || 'ไม่มีชื่อ'; }
export function fileName(meta, ext) {
  return [meta.subject,meta.grade,meta.type,meta.title,new Date().toISOString().slice(0,10),randomUUID().slice(0,8)].map(safeName).join('_') + '.' + ext;
}
export function parseUpload(body) {
  if (!body || typeof body !== 'object' || typeof body.name !== 'string' || !body.name.trim()) throw new Error('กรุณาระบุชื่อไฟล์');
  if (body.metadata && (typeof body.metadata !== 'object' || Array.isArray(body.metadata))) throw new Error('ข้อมูลหมวดหมู่ไม่ถูกต้อง');
  for (const key of ['subject','grade','type','title']) if (body.metadata?.[key] !== undefined && typeof body.metadata[key] !== 'string') throw new Error('ข้อมูลหมวดหมู่ต้องเป็นข้อความ');
  const content = body.content_base64;
  if (typeof content !== 'string' || !content.length || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(content)) throw new Error('ข้อมูลไฟล์ base64 ไม่ถูกต้อง');
  const bytes = Buffer.from(content,'base64');
  if (bytes.length > 15*1024*1024) throw new Error('รองรับไฟล์สูงสุด 15 MB ต่อไฟล์');
  const ext = body.name.split('.').pop().toLowerCase();
  const mime = {pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain',md:'text/markdown',html:'text/html'}[ext];
  if (!mime) throw new Error('ไม่รองรับนามสกุลไฟล์นี้');
  return {bytes,ext,mime,meta:classify(body.name,body.metadata)};
}
