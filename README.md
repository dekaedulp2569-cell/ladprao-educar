# ระบบขอใช้รถและจัดสรรคิวรถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว

เว็บแอปพลิเคชันสำหรับยื่นคำขอใช้รถราชการ ตรวจสอบเงื่อนไขการอนุมัติอัตโนมัติ จัดสรรคิวรถ/พนักงานขับรถ และเผยแพร่ปฏิทินการใช้รถให้บุคลากรตรวจสอบได้โดยไม่ต้องเข้าสู่ระบบ

- **เว็บไซต์ (หลัง deploy):** https://dekaedulp2569-cell.github.io/ladprao-educar/
- **Repository:** https://github.com/dekaedulp2569-cell/ladprao-educar

## ฟีเจอร์หลัก

| ฟีเจอร์ | รายละเอียด |
|---|---|
| ปฏิทินสาธารณะ | ดูรายการใช้รถรายเดือน/รายวัน เลือกดูตามคันรถ ไม่ต้อง Login (Read-Only) |
| ยื่นคำขอใช้รถ | เลือกประเภทเอกสาร + เลขที่, ข้อมูลผู้ขอ, วันเวลา, ปลายทาง/จังหวัด, จำนวนคน, วัตถุประสงค์ |
| ตรวจเงื่อนไขอัตโนมัติ | นอกเวลา 08:00–16:00 น. หรือจังหวัด ≠ กรุงเทพมหานคร → เสนอ ผอ.เขต (สถานะ `tentative`) |
| อนุมัติ 2 ระดับ | ปกติ: หัวหน้าฝ่ายการศึกษา (ปฏิบัติราชการแทน ผอ.เขต) / พิเศษ: ผอ.เขตลาดพร้าว (ปฏิบัติราชการแทน ปลัด กทม.) |
| แดชบอร์ด Admin | จัดการคิว, จัดสรรรถ (รถตู้/กระบะ/รถยืม), จัดสรรคนขับ (ฝ่ายเรา/ฝ่ายอื่น), เปลี่ยนสถานะ, ตรวจการจองซ้ำ |
| คำขอของฉัน | ผู้ขอติดตามสถานะคำขอของตนเอง |
| ตารางงานคนขับ | คนขับฝ่ายเราเห็นงานส่วนตัว, คนขับฝ่ายอื่นถูกบันทึกชื่อและแจ้งผ่านกลุ่มกลาง |
| รายงาน | ส่งออก CSV ตามปีงบประมาณ (1 ต.ค.–30 ก.ย.) และล้างข้อมูลย้อนหลัง 2 ปี |
| LINE | แจ้งสถานะผู้ขอ, แจ้งงานคนขับฝ่ายเราแบบส่วนตัว, สรุปงาน 16:30 น. (ผ่าน Supabase Edge Functions) |

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
```

> `anon key` เป็นกุญแจสาธารณะ ใช้ฝังใน frontend ได้ แต่ความปลอดภัยของข้อมูลต้องอาศัย RLS (ดูหัวข้อข้อจำกัด)

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
    LoginModal.jsx           # Login แบบเลือกบทบาท (Demo)
    ui.jsx                   # Modal/Badge/Card/Alert/Spinner
  context/AuthContext.jsx    # session ใน localStorage
  lib/
    supabase.js              # Supabase client
    helpers.js               # สถานะ/วันที่ไทย/ปีงบประมาณ/CSV/ตรวจเวลา
    line.js                  # เรียก Edge Function line-notify
    provinces.js             # 77 จังหวัด
supabase/
  functions/line-notify/     # แจ้งเตือน LINE
  functions/daily-summary/   # สรุปงาน 16:30 น.
  rls_demo.sql               # RLS โหมด Demo
  schema.sql                 # สร้างตาราง (อ้างอิง)
.github/workflows/deploy.yml # Deploy GitHub Pages อัตโนมัติ
```

## บทบาทผู้ใช้งาน (โหมด Demo)

| บทบาท | สิทธิ์ |
|---|---|
| เจ้าหน้าที่ผู้ขอใช้รถ (`requester`) | ยื่นคำขอ, ดูคำขอของตนเอง |
| เจ้าหน้าที่จัดการรถ (`admin`) | จัดการทุกคำขอ, จัดสรรรถ/คนขับ, อนุมัติ, export/purge |
| หัวหน้าฝ่ายการศึกษา (`head_of_dept`) | เข้าแดชบอร์ดจัดการและอนุมัติได้ |
| พนักงานขับรถ (`driver`) | ดูตารางงานของตนเอง (เลือกชื่อจากตาราง `drivers`) |

> **โหมด Demo:** ยังไม่เชื่อม LINE Login/Supabase Auth จึงใช้การเลือกบทบาท + ระบุชื่อ เก็บใน `localStorage` คีย์ `lp_edu_car_session` การป้องกันเป็นเพียงระดับ UI ไม่ใช่ความปลอดภัยจริง

## ฐานข้อมูล Supabase

ตารางหลัก: `car_requests`, `cars`, `drivers`, `user_profiles`

- โปรเจกต์: `ccflyjycsfwnpfgkhpoy` (region `ap-south-1`)
- สร้างตารางใหม่: รัน `supabase_schema.sql` ใน SQL Editor
- เปิดสิทธิ์โหมด Demo: รัน `supabase/rls_demo.sql` (RLS แบบ permissive)

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
4. **Deploy Edge Functions + ตั้ง secrets LINE** และตั้ง pg_cron สำหรับสรุปงาน 16:30 น.
5. **Rate limit / audit log** การเรียก Edge Function และการแก้ไขสถานะ
6. **สำรองข้อมูล** ก่อนใช้ปุ่มล้างข้อมูลย้อนหลัง 2 ปี
