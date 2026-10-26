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

## Cloudflare Workers: saitama-media

โครงการรองรับ **Cloudflare Workers + Static Assets + SQLite-backed Durable Object** โดยตรง ตั้ง `keep_vars: true` เพื่อคง Variables ที่ตั้งผ่าน Dashboard ไว้เมื่อ deploy

ชื่อ Worker ใน `wrangler.jsonc` คือ `saitama-media` ตรงกับ Worker ที่สร้างไว้แล้ว ใช้ repository นี้ deploy เข้า Worker เดิมได้ ไม่ต้องสร้าง Worker ใหม่หรือ D1

- Static Assets ให้บริการหน้าเว็บจาก `public/`
- Durable Object binding `LIBRARY` ถูกสร้างผ่าน migration ใน `wrangler.jsonc` ตอน deploy
- Durable Object เก็บ refresh token ของ Google ที่เข้ารหัสแล้ว พร้อม OAuth state และ session จึงไม่ต้องใช้ persistent disk
- ไฟล์สื่อและข้อมูลหมวดหมู่ยังอยู่ใน Google Drive
- โทเคนและ session ไม่หายเมื่อ Worker restart; คิวอัปโหลดใช้ Durable Object เดียวเพื่อจัดลำดับคำขอ

### Deploy ผ่าน GitHub ที่ Cloudflare Dashboard

1. เปิด **Workers & Pages → saitama-media → Settings → Builds** แล้วเชื่อม repository `SATTASAI/saitama-media` เลือก branch `main` (ชื่อเมนูอาจเปลี่ยนตาม Dashboard)
2. Root directory: `/` · Build command: `npm run build` · Deploy command: `npx wrangler deploy`
3. บันทึกแล้วสั่ง build/deploy โค้ดจะสร้าง binding และ migration ให้จาก `wrangler.jsonc` อย่าใช้ Pages หรืออัปเฉพาะโฟลเดอร์ `public` เพราะจะไม่มี API
4. เปิด URL `https://saitama-media.<subdomain-บัญชีคุณ>.workers.dev` ของ Worker เดิม
5. ตั้ง Variables and Secrets ตามตาราง แล้ว Deploy อีกครั้งเพื่อให้ค่ามีผล

### ค่าที่ต้องตั้งใน Worker

ใน **saitama-media → Settings → Variables and Secrets**:

| ชื่อ | ชนิด | ค่า |
| --- | --- | --- |
| `BASE_URL` | Variable | URL HTTPS ของ Worker จริง ไม่มี `/` ท้าย เช่น `https://saitama-media.your-account.workers.dev` |
| `ADMIN_EMAIL` | Variable | อีเมล Google เจ้าของคลัง |
| `GOOGLE_CLIENT_ID` | Secret | OAuth Client ID ชนิด Web application |
| `GOOGLE_CLIENT_SECRET` | Secret | OAuth Client Secret |
| `TOKEN_ENCRYPTION_KEY` | Secret | ค่าสุ่ม hex 64 ตัว ใช้เข้ารหัส refresh token |
| `INGEST_API_KEY` | Secret | ค่าสุ่มอีกค่าหนึ่ง อย่างน้อย 32 ตัว สำหรับ GPT Action |

สร้างค่าสุ่มบนเครื่องตัวเอง **สองครั้งแยกกัน**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ห้ามใส่ Client Secret, คีย์ หรือ refresh token ลง GitHub หรือส่งในห้องแชต ไม่ต้องตั้ง `PORT` หรือ `DATA_DIR` บน Workers

### Google OAuth สำหรับ Worker ของคุณ

ตั้ง Authorized redirect URI ให้ตรงกับ URL จริงของ Worker:

```text
https://saitama-media.<subdomain-บัญชีคุณ>.workers.dev/oauth/callback
```

รายละเอียดการสร้าง OAuth Client อยู่ในหัวข้อถัดไป เมื่อตั้งครบแล้วเปิดเว็บและกด **เชื่อม Google Drive** ด้วยบัญชี `ADMIN_EMAIL` โฟลเดอร์ “คลังสื่อครู” จะถูกสร้างเมื่ออัปโหลดไฟล์ชิ้นแรก

### Deploy ด้วย CLI (อีกทางเลือกหนึ่ง)

```bash
npm ci
npx wrangler login
npm run deploy
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put TOKEN_ENCRYPTION_KEY
npx wrangler secret put INGEST_API_KEY
```

ตั้ง `BASE_URL` และ `ADMIN_EMAIL` ผ่าน Dashboard แล้ว Deploy/บันทึกให้ค่ามีผล การ deploy ใช้บัญชี Cloudflare เดียวกับ Worker ที่สร้างไว้ ดูชื่อ Worker และ Durable Object binding ในผลลัพธ์ Wrangler

### เปิด Workers บนเครื่องตัวเอง

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run dev
```

ตั้งค่าจริงใน `.dev.vars` แล้วเพิ่ม Google redirect URI `http://localhost:8787/oauth/callback` ข้อมูลจำลองในเครื่องอยู่ใน `.wrangler/` และไม่ปะปนกับ production

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

## 3. โฮสต์แบบ Node.js (ทางเลือก)

`npm start` ยังรัน Node.js server เดิมได้ แต่ **บน Cloudflare ใช้ `npm run deploy` ตามคู่มือด้านบน** ไม่ใช้ Docker หรือ `node server.mjs`

หากเลือกโฮสต์ Node.js แทน Workers ต้องมี persistent disk ที่ `DATA_DIR` ใช้ 1 instance และตั้ง `.env` ตาม `.env.example` ส่วน Workers เก็บข้อมูลผ่าน Durable Object ให้แล้ว

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
- refresh token เข้ารหัส AES-256-GCM ก่อนเก็บใน Durable Object (Workers) หรือ `data/google.enc` (Node.js) และไม่รวมใน Git
- session เป็น HttpOnly cookie มีอายุ 8 ชั่วโมง; ออนไลน์ใช้ Secure cookie
- ตรวจ OAuth state และอีเมลเจ้าของก่อนเชื่อม Drive
- การเขียนจากเว็บต้องมี session และ Origin ตรงกับ BASE_URL; Action ใช้ Bearer key
- ไม่แชร์ไฟล์ Drive เป็นสาธารณะ ไม่ลบไฟล์ และไม่โหลด HTML ที่อัปโหลดมาแสดงใน origin ของเว็บไซต์
- สำรอง `TOKEN_ENCRYPTION_KEY` แยกจาก GitHub; เปลี่ยนคีย์แล้วต้องเชื่อม Google ใหม่ อย่าลบ Durable Object storage หรือเปลี่ยนชื่อ object `owner-library-v1` หากต้องการคงการเชื่อมต่อเดิม

## ตรวจสอบ

```bash
npm test
node --check server.mjs
node --check public/app.js
npm run build
```

Tests ตรวจชื่อ/หมวดหมู่ payload, HTTP authorization, OAuth/session ของ Workers และการอัปโหลดซ้ำหลังเริ่ม instance ใหม่ โดยจำลอง Google API ไม่ใช้บัญชีจริง การเชื่อม Google OAuth, อัปโหลด Drive จริง และเรียก GPT Action ต้องทดสอบหลังตั้งค่า credentials และ URL ของคุณ
