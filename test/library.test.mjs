import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, parseUpload, safeName, fileName } from '../library.mjs';
test('แนะนำหมวดหมู่จากชื่อภาษาไทยและอังกฤษ',()=>{
  assert.deepEqual(classify('แบบฝึกหัดคณิตศาสตร์_ป.3_การคูณ.pdf'),{title:'แบบฝึกหัดคณิตศาสตร์_ป.3_การคูณ',subject:'คณิตศาสตร์',grade:'ป.3',type:'แบบฝึกหัด'});
  assert.equal(classify('English ม.2 presentation.pptx').subject,'ภาษาอังกฤษ');
  assert.equal(classify('สื่อวิทยาศาสตร์ ประถมศึกษา4 พืช.pdf').grade,'ป.4');
});
test('เก็บหมวดที่ผู้ใช้แก้และใช้ค่ากลางเมื่อไม่ทราบ',()=>{
  assert.equal(classify('ไฟล์ใหม่.pdf').subject,'ทั่วไป');
  assert.equal(classify('ไฟล์ใหม่.pdf').grade,'ไม่ระบุชั้น');
  const m=classify('math ป.1.pdf',{subject:'ภาษาไทย',grade:'ม.6',type:'สื่อการสอน',title:'บทอ่าน'});
  assert.equal(m.subject,'ภาษาไทย');assert.equal(m.grade,'ม.6');assert.equal(m.title,'บทอ่าน');
});
test('ชื่อไฟล์ไม่แทรกเส้นทางและมี suffix ป้องกันชื่อชน',()=>{
  assert.equal(safeName('../../a/b\\c\u0000'), '..-..-a-b-c-');
  const m=classify('คณิต ป.3.pdf');assert.notEqual(fileName(m,'pdf'),fileName(m,'pdf'));
  assert.ok(fileName(m,'pdf').endsWith('.pdf'));
});
test('อ่านไบต์ไฟล์จริงและปฏิเสธข้อมูลผิดรูปแบบ/ชนิด/ขนาด',()=>{
  const d=parseUpload({name:'งาน.pdf',content_base64:Buffer.from('%PDF-1.7').toString('base64')});
  assert.equal(d.bytes.toString(),'%PDF-1.7');
  assert.throws(()=>parseUpload({name:'x.pdf',content_base64:'???='}));
  assert.throws(()=>parseUpload({name:'x.exe',content_base64:'YQ=='}));
  assert.throws(()=>parseUpload({name:'x.pdf',content_base64:'YQ==',metadata:{title:{bad:true}}}));
  assert.throws(()=>parseUpload({name:'x.pdf',content_base64:Buffer.alloc(15*1024*1024+1).toString('base64')}));
});
