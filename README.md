# ระบบขอใช้รถและจัดสรรคิวรถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว

[![Deploy to GitHub Pages](https://github.com/dekaedulp2569-cell/ladprao-educar/actions/workflows/deploy.yml/badge.svg)](https://github.com/dekaedulp2569-cell/ladprao-educar/actions/workflows/deploy.yml)

เว็บแอปพลิเคชันสำหรับยื่นคำขอใช้รถราชการ ตรวจสอบเงื่อนไขการอนุมัติอัตโนมัติ จัดสรรคิวรถ/พนักงานขับรถ และเผยแพร่ปฏิทินการใช้รถให้บุคลากรตรวจสอบได้โดยไม่ต้องเข้าสู่ระบบ

- **เว็บไซต์ (หลัง deploy):** https://dekaedulp2569-cell.github.io/ladprao-educar/
- **Repository:** https://github.com/dekaedulp2569-cell/ladprao-educar

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---|---|
| ปฏิทินสาธารณะ | ดูรายการใช้รถรายเดือน/รายวัน เลือกดูตามคันรถ ไม่ต้อง Login (Read-Only) |
| ยื่นคำขอใช้รถ | เลือกประเภทเอกสาร + เลขที่, วันที่ยื่นคำขอ (ตั้งต้นเป็นวันที่ปัจจุบัน พ.ศ. และแก้ไขได้), ข้อมูลผู้ขอ, วันเวลา, ปลายทาง/จังหวัด, จำนวนคน, วัตถุประสงค์ |
| ตรวจเงื่อนไขอัตโนมัติ | นอกเวลา 08:00–16:00 น. หรือจังหวัด ≠ กรุงเทพมหานคร → เสนอ ผอ.เขต (สถานะ `tentative`) |
| อนุมัติ 2 ระดับ | ปกติ: หัวหน้าฝ่ายการศึกษา (ปฏิบัติราชการแทน ผอ.เขต) / พิเศษ: ผอ.เขตลาดพร้าว (ปฏิบัติราชการแทน ปลัด กทม.) |
| แดชบอร์ด Admin | ตารางคำขอ, แก้ไข/พิมพ์แบบ ๓/ยกเลิก/ส่ง LINE, จัดสรรรถและคนขับ, เปลี่ยนสถานะ, ตรวจการจองซ้ำ |
| คำขอของฉัน | ผู้ขอติดตามสถานะคำขอของตนเอง |
| ตารางงานคนขับ | คนขับฝ่ายเราเห็นงานส่วนตัว, คนขับฝ่ายอื่นถูกบันทึกชื่อและแจ้งผ่านกลุ่มกลาง |
| รายงาน | ส่งออก CSV ตามปีงบประมาณ (1 ต.ค.–30 ก.ย.) และล้างข้อมูลย้อนหลัง 2 ปี |
| LINE | แจ้งสถานะผู้ขอ, แจ้งงานคนขับฝ่ายเราแบบส่วนตัว, สรุปงาน 15:00 น. (ผ่าน Supabase Edge Functions) |

## เทคโนโลยี

- Vite 8 + React 19
- Tailwind CSS v4 (ผ่าน `@tailwindcss/vite` + `@theme` ใน `src/index.css`)
- Supabase (Postgres + PostgREST + Edge Functions)
- ฟอนต์ Noto Sans Thai, ธีมเขียว Emerald/Forest Green, Mobile-First

## การรันในเครื่อง

```bash
npm install
npm run dev
# เปิด http://localhost:5173/ladprao-educar/
```

คำสั่งอื่น:

```bash
npm run build    # สร้าง dist/
npm run preview  # ทดสอบไฟล์ build
npm run lint     # ตรวจโค้ดด้วย oxlint
```

### ตัวแปรสภาพแวดล้อม (ไม่บังคับ)

ค่าเริ่มต้นใน `src/lib/supabase.js` ชี้ไปยังโปรเจกต์ Supabase ที่ใช้งานอยู่แล้ว หากต้องการเปลี่ยนโปรเจกต์ ให้คัดลอก `.env.example` เป็น `.env` แล้วแก้ค่า:

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon public key>
VITE_LINE_LIFF_ID=<LIFF ID>
```

> `anon key` และ LIFF ID เป็นค่าที่เปิดเผยได้ แต่ห้ามใส่ Channel secret, Channel access token หรือ Supabase service role key ใน frontend

## โครงสร้างโปรเจกต์

```
src/
  App.jsx                    # โครงแอป + เมนูตามบทบาท + gate สิทธิ์
  components/
    PublicCalendar.jsx       # ปฏิทินสาธารณะ
    CarRequestForm.jsx       # ฟอร์มขอใช้รถ + validation + หน้า success
    MyRequests.jsx           # คำขอของฉัน
    AdminDashboard.jsx       # แดชบอร์ดจัดการคำขอ/รถ/คนขับ/รายงาน
    DriverSchedule.jsx       # ตารางงานพนักงานขับรถ
    LoginModal.jsx           # เข้าสู่ระบบผ่าน LINE LIFF
    ui.jsx                   # Modal/Badge/Card/Alert/Spinner
  context/AuthContext.jsx    # Supabase Auth session และโปรไฟล์ที่อนุมัติแล้ว
  lib/
    supabase.js              # Supabase client
    helpers.js               # สถานะ/วันที่ไทย/ปีงบประมาณ/CSV/ตรวจเวลา
    line.js                  # เรียก Edge Function line-notify
    lineAuth.js              # LIFF Login และสร้าง Supabase Auth session
    provinces.js             # 77 จังหวัด
supabase/
  functions/line-auth/      # ตรวจสอบ LINE ID token และออก Supabase session
  functions/line-notify/     # แจ้งเตือน LINE
  functions/daily-summary/   # สรุปงาน 15:00 น.
  migrations/                # RLS และ schema สำหรับ LINE Login
  rls_demo.sql               # RLS โหมด Demo
  schema.sql                 # สร้างตาราง (อ้างอิง)
.github/workflows/deploy.yml # Deploy GitHub Pages อัตโนมัติ
```

## LINE Login และการอนุมัติบัญชี

ผู้ใช้เข้าสู่ระบบผ่าน LIFF; Edge Function `line-auth` ตรวจสอบ LINE ID token กับ LINE ก่อนเชื่อมบัญชี Supabase Auth โปรไฟล์ใหม่จะเริ่มเป็น `requester` และใช้งานได้ทันที ผู้ดูแลระบบคนแรกต้องกำหนดบทบาท `admin` ด้วยตนเองใน Supabase

ก่อนเปิดระบบ ให้ดำเนินการใน Supabase:

1. รัน migration ตามลำดับใน SQL Editor: `20261104000000_line_login_access.sql`, `20261104010000_workflow_approval_roles.sql` และ `20261104220000_add_request_date.sql` เพื่อเพิ่มข้อมูลบัญชี/วันที่ยื่นคำขอและจำกัด RLS (migration แรกปิด Demo policies เดิม)
2. ในโฟลเดอร์โปรเจกต์ รันคำสั่งต่อไปนี้ (ต้องติดตั้ง Supabase CLI และมีสิทธิ์โปรเจกต์):

   ```powershell
   supabase login
   supabase link --project-ref ccflyjycsfwnpfgkhpoy
   supabase secrets set LINE_LOGIN_CHANNEL_ID=2012159727
   supabase functions deploy line-auth
   supabase functions deploy line-notify
   ```

   `LINE_LOGIN_CHANNEL_ID` คือ ID ของ LINE Login channel ไม่ใช่ LIFF ID หรือ Messaging API token ตรวจว่า `supabase/config.toml` ถูกนำไปใช้ในการ deploy
3. ตั้ง LIFF Endpoint URL เป็น `https://dekaedulp2569-cell.github.io/ladprao-educar/` พร้อม scope `openid` และ `profile`
4. รัน `supabase/migrations/20261104223000_request_cancellation.sql` หลัง workflow migration เพื่อเปิดสถานะยกเลิกและสิทธิ์ยกเลิกคำขอที่อนุมัติแล้ว
5. รัน `supabase/migrations/20261105000000_admin_request_management.sql` เพื่อคำนวณเส้นทางอนุมัติใหม่เมื่อ Admin แก้วันเวลา จังหวัด หรือวันหยุดของคำขอ
6. Push frontend ไป `main` เพื่อ deploy ผ่าน GitHub Actions แล้วให้บัญชีผู้ดูแลคนแรกลงชื่อเข้า LINE หนึ่งครั้ง ระบบจะสร้างโปรไฟล์ `requester` ที่เปิดใช้งานได้ทันที
7. ตรวจสอบ LINE User ID ของผู้ดูแลคนแรกใน SQL Editor:

   ```sql
   select id, full_name, line_user_id, role, approval_status
   from public.user_profiles
   where role = 'requester'
   order by created_at desc;
   ```

   จากนั้นตรวจยืนยัน LINE User ID แล้วอนุมัติบัญชีผู้ดูแล:

   ```sql
   update public.user_profiles
   set role = 'admin', approval_status = 'approved'
   where line_user_id = '<LINE_USER_ID>';
   ```

8. ให้ผู้ดูแลเปลี่ยนบทบาทบัญชีแรกเป็น `admin` ใน SQL Editor แล้วจัดการบทบาทสมาชิกที่เหลือจากเมนูสมาชิก

บัญชีใหม่จะผูก LINE User ID อัตโนมัติ แต่ข้อมูลตำแหน่งและสังกัดต้องให้ผู้ดูแลแก้ไขก่อนหรือหลังอนุมัติ ห้ามส่ง Channel secret, Channel access token หรือ service role key ผ่านแชต/commit; ค่าเหล่านั้นต้องอยู่ใน Supabase Secrets เท่านั้น

เนื่องจาก token เดิมถูกเพิกถอนแล้ว หากยังใช้ LINE Messaging API แจ้งเตือน ให้สร้าง token ใหม่และแทนค่า `LINE_CHANNEL_ACCESS_TOKEN` ใน Supabase Secrets ด้วยตนเอง (ห้ามส่ง token ใหม่ให้ผม)

คำขอเก่าก่อนเชื่อม LINE จะไม่มี `requester_auth_user_id` และจะแสดงให้ผู้ดูแลเท่านั้น ต้องตรวจสอบเอกสารแล้วผูกประวัติที่ถูกต้องด้วยตนเองก่อนให้ผู้ขอเห็นรายการย้อนหลัง

## บทบาทผู้ใช้งาน

| บทบาท | สิทธิ์ |
|---|---|
| เจ้าหน้าที่ผู้ขอใช้รถ (`requester`) | ยื่นคำขอ, ดูคำขอของตนเอง, ยกเลิกคำขอที่อนุมัติแล้ว พร้อมแจ้งผู้เกี่ยวข้องและกลุ่มฝ่าย |
| เจ้าหน้าที่จัดการรถ (`admin`) | ดูตารางคำขอ, แก้ไขคำขอที่ยังไม่ยกเลิก, พิมพ์แบบ ๓, จัดสรรรถ/คนขับ, อนุมัติ/ยกเลิก, ส่ง LINE ซ้ำ, export/purge |
| หัวหน้าฝ่ายการศึกษา (`head_of_dept`) | เข้าแดชบอร์ดจัดการและอนุมัติได้ |
| พนักงานขับรถ (`driver`) | ดูตารางงานของตนเอง (เลือกชื่อจากตาราง `drivers`) |

สิทธิ์จัดการข้อมูลตรวจสอบจากโปรไฟล์ที่อนุมัติแล้วในฐานข้อมูลและ RLS ไม่ได้เชื่อถือบทบาทจาก `localStorage`

## ฐานข้อมูล Supabase

ตารางหลัก: `car_requests`, `cars`, `drivers`, `user_profiles`

- โปรเจกต์: `ccflyjycsfwnpfgkhpoy` (region `ap-south-1`)
- สร้างตารางใหม่: รัน `supabase_schema.sql` ใน SQL Editor
- **ห้ามรัน** `supabase/rls_demo.sql` ใน production เพราะเป็น RLS แบบ permissive สำหรับ Demo เท่านั้น

ข้อมูลเริ่มต้น: รถ 2 คัน (ฮว 4098 รถตู้, กข 1234 รถกระบะ) และพนักงานขับรถ 2 คน

## Deploy ขึ้น GitHub Pages

Workflow `.github/workflows/deploy.yml` จะ build และ deploy เมื่อ push เข้า branch `main`

1. Push โค้ดขึ้น GitHub
2. ไปที่ **Settings → Pages → Build and deployment → Source** เลือก **GitHub Actions**
3. รอ workflow “Deploy to GitHub Pages” ทำงานเสร็จ แล้วเปิด https://dekaedulp2569-cell.github.io/ladprao-educar/

`vite.config.js` ตั้ง `base: '/ladprao-educar/'` ให้ตรงกับชื่อ repository หากเปลี่ยนชื่อ repo ต้องแก้ค่านี้ด้วย

## LINE Messaging API

รายละเอียดการตั้งค่าและ deploy Edge Functions อยู่ใน [`supabase/functions/README.md`](supabase/functions/README.md)

สรุปขั้นตอน:

```bash
supabase login
supabase link --project-ref ccflyjycsfwnpfgkhpoy
supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=xxx LINE_GROUP_ID=Cxxxxxxxx CRON_SECRET=random-string
supabase functions deploy line-notify
supabase functions deploy daily-summary
```

- ถ้ายังไม่ตั้งค่า ฟังก์ชัน LINE จะคืน `{ skipped: true }` และแอปยังทำงานปกติ
- คนขับฝ่ายเราต้องมี `drivers.line_user_id` เพื่อรับข้อความส่วนตัว
- คนขับฝ่ายอื่น/ยังไม่ผูก LINE จะถูกแจ้งเข้ากลุ่มกลางเท่านั้น
- เมื่อ Admin แก้ข้อมูลคำขอ ระบบจะส่งรายละเอียดล่าสุดให้ผู้ขอ คนขับที่เชื่อม LINE และกลุ่มฝ่าย; หากแก้วันเวลา จังหวัด หรือวันหยุดของรายการที่อนุมัติ ระบบจะคืนสถานะเข้ารออนุมัติและล้างการจัดสรรรถ/คนขับเดิม

## ข้อมูลทดสอบ

ฐานข้อมูลปัจจุบันมีรายการทดสอบจากการตรวจสอบระบบ:

- `ทดสอบ-เว็บ-001` — นายทดสอบ ระบบ (อนุมัติแล้ว, กรุงเทพมหานคร)
- `ทดสอบ-เว็บ-002` — นายทดสอบ ระบบ (อนุมัติแล้ว, เชียงใหม่/นอกเวลา)
- `-` — นายรัชชานนท์ ประจงกิจ (รอ ผอ.เขต, 10 พ.ย. 2569)

ลบได้ผ่าน SQL Editor หรือปล่อยไว้เป็นตัวอย่างการใช้งาน

## ข้อจำกัดและสิ่งที่ควรทำก่อนใช้งานจริง

1. **เปลี่ยนระบบ Login** เป็น LINE Login (LIFF) หรือ Supabase Auth และผูก `user_profiles.line_user_id`
2. **เปลี่ยน RLS** จาก `demo_all_*` เป็น policy ตามบทบาท/เจ้าของข้อมูล เพื่อไม่ให้ anon key อ่าน/เขียนได้ทุกอย่าง
3. **ยืนยันตัวตนผู้อนุมัติ** ก่อนอนุญาตให้เปลี่ยนสถานะเป็น `approved`
4. **Deploy Edge Functions + ตั้ง secrets LINE** และตั้ง pg_cron สำหรับสรุปงาน 15:00 น.
5. **Rate limit / audit log** การเรียก Edge Function และการแก้ไขสถานะ
6. **สำรองข้อมูล** ก่อนใช้ปุ่มล้างข้อมูลย้อนหลัง 2 ปี
