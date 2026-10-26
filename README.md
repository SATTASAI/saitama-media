# คลังสื่อครู

เว็บไซต์ภาษาไทยสำหรับเก็บใบงาน สื่อการสอน และแบบฝึกหัด โดยเก็บ **โค้ดใน GitHub** และเก็บ **ไฟล์จริงใน Google Drive** ของเจ้าของระบบ ไม่อัปโหลดไฟล์สื่อหรือข้อมูลลับลง GitHub

## ทำอะไรได้

- เข้าสู่ระบบด้วย Google เฉพาะบัญชีเจ้าของที่ระบุไว้
- อัปโหลด PDF, DOCX, PPTX, XLSX, PNG, JPG, WEBP, TXT, Markdown และ HTML สูงสุด 15 MB ต่อไฟล์
- ตั้งชื่อไฟล์และแนะนำวิชา/ชั้น/ประเภทจากชื่อไฟล์ ด้วยกฎคำสำคัญ (ยังไม่อ่านเนื้อหาใน PDF หรือรูปภาพ)
- ตรวจแก้ชื่อและหมวดก่อนบันทึกได้ทุกไฟล์
- เก็บใน `คลังสื่อครู / วิชา / ชั้น / ประเภท / ไฟล์`
- ค้นหา กรองวิชา/ชั้น/ประเภท จัดเรียง และเปิดไฟล์ใน Drive
- รับสื่อจาก Custom GPT ผ่าน Action พร้อมตรวจคำขอซ้ำด้วย request_id
- ไฟล์ที่อยู่ใน Drive มาก่อนและไม่ได้สร้างผ่านระบบนี้จะไม่ถูกรวมในคลังโดยอัตโนมัติ

## 1. ตั้งค่า Google ครั้งแรก

1. สร้างหรือเลือกโปรเจกต์ใน [Google Cloud Console](https://console.cloud.google.com/)
2. เปิด **Google Drive API**
3. ตั้ง OAuth consent screen (Google Auth Platform → Branding, Audience, Data Access) และเพิ่มอีเมลเจ้าของเป็น Test user ถ้ายังอยู่ในโหมด Testing
4. สร้าง OAuth Client ชนิด **Web application**
5. เพิ่ม Authorized redirect URI ให้ตรงทุกตัวอักษร:
   - เครื่องตัวเอง: `http://localhost:3000/oauth/callback`
   - ออนไลน์: `https://your-domain.example/oauth/callback`
6. ใช้ scope `openid`, `email`, `https://www.googleapis.com/auth/drive.file` ซึ่งจำกัด Drive ให้เฉพาะไฟล์ที่แอปสร้าง/เข้าถึงได้ ไม่ขอสิทธิ์อ่าน Drive ทั้งบัญชี
7. นำ Client ID, Client Secret และอีเมลเจ้าของไปตั้งใน `.env` หรือ environment variables ของโฮสต์

แอป External ที่อยู่ใน Testing อาจได้ refresh token อายุประมาณ 7 วันสำหรับ scope นี้ ต้องเชื่อมใหม่ หรือดำเนินการตั้งสถานะ Publishing/Verification ตามข้อกำหนดปัจจุบันของ Google

## 2. เปิดในเครื่อง

ต้องมี Node.js 22 ขึ้นไป ไม่ต้องติดตั้ง dependency

```bash
cp .env.example .env
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

สร้างค่าข้างต้น **สองครั้งแยกกัน** ใช้ค่าหนึ่งเป็น `TOKEN_ENCRYPTION_KEY` (64 หลัก hex) และอีกค่าหนึ่งเป็น `INGEST_API_KEY` (อย่างน้อย 32 ตัวอักษร) แก้ `.env` ให้ครบ แล้วรัน:

```bash
npm start
```

เปิด `http://localhost:3000` แล้วกดเชื่อม Google Drive ด้วยบัญชี `ADMIN_EMAIL`

หน้าเว็บเปิดดูได้ก่อนตั้งค่า แต่ยังอ่านหรืออัปโหลดไฟล์จริงไม่ได้จนกว่าจะเชื่อม Google สำเร็จ

## 3. เปิดออนไลน์

โฮสต์ต้องรัน Node.js ได้ เช่น Render, Railway, VPS หรือบริการ container; **GitHub Pages รัน backend นี้ไม่ได้**

- Build command: ไม่จำเป็น (ไม่มี dependency)
- Start command: `node server.mjs`
- ตั้ง `BASE_URL` เป็น URL HTTPS ของระบบโดยไม่มี `/` ท้ายสุด
- ตั้ง Google OAuth redirect URI ให้ตรงกับ URL ออนไลน์
- ตั้งค่า environment ทั้งหมดตาม `.env.example` ผ่านระบบ secrets ของโฮสต์
- ต้องมี **persistent disk** ต่อที่ `DATA_DIR` (เช่น `/app/data`) เพื่อเก็บ refresh token ที่เข้ารหัสแล้ว หากไม่มี disk จะต้องเชื่อม Google ใหม่หลัง restart/redeploy
- ใช้ **1 instance**: session, OAuth state และคิวอัปโหลดอยู่ในหน่วยความจำ ยังไม่รองรับหลาย replica การ restart ทำให้ออกจากระบบเว็บไซต์แต่เชื่อม Google ต่อได้ถ้ามี persistent disk
- reverse proxy ต้องส่ง HTTPS ให้ผู้ใช้ และรองรับ request body อย่างน้อย 22 MB; ภายใน container ใช้ port `PORT`

มี Dockerfile ให้ แต่ต้องต่อ persistent volume ที่ `/app/data` และใส่ค่า environment เอง

## 4. เชื่อมกับ ChatGPT ให้สร้างแล้วบันทึก

การสนทนาทั่วไปใน ChatGPT **ยังไม่ส่งไฟล์เข้าคลังเอง** ให้ใช้ Custom GPT ที่คุณตั้งค่า Action สำหรับระบบนี้ บัญชีต้องรองรับการสร้าง GPT และการใช้ Actions

1. เปิดระบบบน HTTPS และเชื่อม Google Drive ก่อน
2. เปิดตัวแก้ไข GPT → Configure → Actions → Import from URL: `https://your-domain.example/openapi.json`
3. เลือก Authentication → API Key → Bearer แล้วใส่ค่า `INGEST_API_KEY` **เฉพาะช่อง Authentication** ห้ามใส่ใน instructions, prompt, source code หรือไฟล์ schema
4. ตั้ง instructions เช่น:

> เมื่อผู้ใช้สั่งสร้างใบงาน สื่อการสอน หรือแบบฝึกหัดและให้บันทึก ให้สร้างเนื้อหาครบถ้วนในรูปแบบ HTML พร้อม CSS สำหรับพิมพ์ หรือ Markdown ตามความเหมาะสม จากนั้นเรียก saveTeachingMaterial โดยส่งเนื้อหาจริงทั้งหมด พร้อมชื่อ วิชา ระดับชั้น และประเภท สร้าง request_id ใหม่สำหรับสื่อแต่ละชิ้น หากส่งซ้ำของคำขอเดิมให้ใช้ request_id และเนื้อหาเดิม ห้ามอ้างว่าบันทึกสำเร็จจนกว่า API จะคืน file.id และให้ลิงก์ webViewLink ของผลลัพธ์ เมื่อไม่มีลิงก์ให้ใช้ https://drive.google.com/file/d/FILE_ID/view

5. ทดสอบ: “สร้างใบงานคณิตศาสตร์ ป.3 เรื่องการคูณ 10 ข้อ พร้อมเฉลย แล้วบันทึกเข้าคลัง”

**ข้อจำกัดของ Action รุ่นนี้:** ส่งเนื้อหา HTML/Markdown/TXT เข้าคลังได้ ไม่ได้หยิบไฟล์ PDF/Word ที่ ChatGPT สร้างในห้องสนทนามาเอง และไม่แปลง HTML เป็น PDF บัญชี ChatGPT อาจขอยืนยันก่อนใช้ Action ตามนโยบายและการตั้งค่า การดาวน์โหลด/พิมพ์ HTML เป็น PDF ทำบนเครื่องผู้ใช้ได้ ส่วน PDF/Office จริงอัปโหลดจากหน้าเว็บ หรือส่งเป็น base64 ผ่าน API ได้

API key ให้สิทธิ์เขียนเข้าคลังเจ้าของ จึงควรเก็บ GPT นี้เป็นส่วนตัว การออกจากเว็บไซต์ไม่ถอนการเชื่อม Drive และ Action ยังใช้งานได้ หากต้องการหยุดให้เปลี่ยน/ลบ `INGEST_API_KEY` หรือถอนสิทธิ์แอปจากบัญชี Google

## API สำหรับไฟล์จริง

`POST /api/ingest` พร้อม header `Authorization: Bearer <INGEST_API_KEY>`

```json
{
  "request_id": "replace-with-a-unique-uuid",
  "name": "คณิตศาสตร์_ป.3_ใบงาน_การคูณ.pdf",
  "content_base64": "BASE64_OF_ACTUAL_FILE",
  "metadata": {"subject": "คณิตศาสตร์", "grade": "ป.3", "type": "ใบงาน", "title": "การคูณ"}
}
```

สำหรับข้อความใช้ `text_content` แทน `content_base64` และตั้งนามสกุล `.html`, `.md`, `.txt` ให้ตรงรูปแบบ ข้อมูลต้องเป็นเนื้อหาจริง ไม่รับ URL ไปดาวน์โหลดแทน เมื่อไม่แน่ใจว่าบันทึกสำเร็จ ให้ตรวจรายการในคลังหรือใช้ request_id เดิมกับเนื้อหาเดิม; ระบบคืนไฟล์เดิมเมื่อพบ และคืน 409 หากใช้ id เดิมกับเนื้อหาใหม่ การตอบล้มเหลวไม่ใช่หลักฐานว่า Drive ไม่ได้สร้างไฟล์

## การรักษาข้อมูล

- Client Secret, API key และ refresh token ไม่ถูกส่งไป browser
- refresh token เข้ารหัส AES-256-GCM ก่อนเก็บใน `data/google.enc` และไม่รวมใน Git
- session เป็น HttpOnly cookie มีอายุ 8 ชั่วโมง; ออนไลน์ใช้ Secure cookie
- ตรวจ OAuth state และอีเมลเจ้าของก่อนเชื่อม Drive
- การเขียนจากเว็บต้องมี session และ Origin ตรงกับ BASE_URL; Action ใช้ Bearer key
- ไม่แชร์ไฟล์ Drive เป็นสาธารณะ ไม่ลบไฟล์ และไม่โหลด HTML ที่อัปโหลดมาแสดงใน origin ของเว็บไซต์
- สำรอง `TOKEN_ENCRYPTION_KEY` และ persistent disk แยกจาก GitHub; เปลี่ยนคีย์แล้วต้องเชื่อม Google ใหม่

## ตรวจสอบ

```bash
npm test
node --check server.mjs
node --check public/app.js
```

Tests ตรวจชื่อ/หมวดหมู่ การตรวจ payload และ HTTP authorization โดยไม่ใช้บัญชีจริง การเชื่อม Google OAuth, อัปโหลด Drive จริง และเรียก GPT Action ต้องทดสอบหลังตั้งค่า credentials และ URL ของคุณ
