import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync, deflateSync } from 'node:zlib';
import { analyzeFile, parseUpload } from '../library.mjs';
const input=(name,text)=>({name,content_base64:Buffer.from(text).toString('base64')});
function zipEntry(path,xml){
  const name=Buffer.from(path),data=Buffer.from(xml),packed=deflateRawSync(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(8,10);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);
  const offset=local.length+name.length+packed.length,end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([local,name,packed,central,name,end]);
}
test('content determines title, subject, grade and category; HTML scripts cannot influence suggestions',()=>{
  const result=analyzeFile(input('scan001.html','<script>คณิตศาสตร์ แบบฝึกหัด</script><h1>Wild Animals English Lesson Grade 4</h1><p>Learn animal vocabulary.</p>'));
  assert.equal(result.title,'Wild Animals English Lesson Grade 4');assert.equal(result.subject,'ภาษาอังกฤษ');assert.equal(result.grade,'ป.4');assert.equal(result.type,'สื่อการสอน');assert.equal(result.analysis.source,'content');
  const exercise=analyzeFile(input('new.txt','แบบฝึกหัดคณิตศาสตร์ ป.3 การคูณ\nคำชี้แจง: เลือกคำตอบที่ถูกต้อง'));
  assert.equal(exercise.type,'แบบฝึกหัด');assert.equal(exercise.subject,'คณิตศาสตร์');assert.equal(exercise.title,'แบบฝึกหัดคณิตศาสตร์ ป.3 การคูณ');
});
test('compressed Office content supplies suggestions and manual edits always win during upload',()=>{
  const bytes=zipEntry('word/document.xml','<w:document><w:p><w:r><w:t>ใบงานวิทยาศาสตร์ ป.4 เรื่องพืช</w:t></w:r></w:p></w:document>');
  const body={name:'Document1.docx',content_base64:bytes.toString('base64')};
  const result=analyzeFile(body);assert.equal(result.subject,'วิทยาศาสตร์');assert.equal(result.grade,'ป.4');assert.equal(result.type,'ใบงาน');assert.equal(result.analysis.source,'content');
  const parsed=parseUpload({...body,metadata:{title:'ชื่อที่ครูแก้',subject:'ภาษาไทย',grade:'ม.1',type:'แบบฝึกหัด'}});
  assert.deepEqual(parsed.meta,{title:'ชื่อที่ครูแก้',subject:'ภาษาไทย',grade:'ม.1',type:'แบบฝึกหัด'});
});
test('basic compressed PDF text is read; images, scans and malformed archives explicitly fall back',()=>{
  const stream=deflateSync(Buffer.from('BT /F1 12 Tf (English worksheet Grade 4 - Animals) Tj ET'));
  const pdf=Buffer.concat([Buffer.from('%PDF-1.7\n<< /Filter /FlateDecode >>\nstream\n'),stream,Buffer.from('\nendstream')]);
  const result=analyzeFile(input('scan.pdf',pdf));assert.equal(result.analysis.source,'content');assert.equal(result.subject,'ภาษาอังกฤษ');assert.equal(result.type,'ใบงาน');
  for(const name of ['scan.pdf','photo.png','broken.docx'])assert.equal(analyzeFile(input(name,'not a readable document')).analysis.source,'filename');
  assert.equal(analyzeFile({name:'lesson.pptx'}).type,'สื่อการสอน');
  assert.throws(()=>analyzeFile(input('bad.exe','anything')));assert.throws(()=>analyzeFile({name:'x.pdf',content_base64:'bad'}));
});
test('oversized expanded archive entries are skipped; XML numeric entities are bounded',()=>{
  const bomb=zipEntry('word/document.xml','<w:p>'+ 'A'.repeat(600*1024)+'</w:p>');
  assert.equal(analyzeFile(input('file.docx',bomb)).analysis.source,'filename');
  assert.doesNotThrow(()=>analyzeFile(input('file.html','<h1>English worksheet &#9999999999;</h1>')));
});
