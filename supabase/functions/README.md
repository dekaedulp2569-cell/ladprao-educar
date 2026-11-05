# Supabase Edge Functions — LINE Integration

ฟังก์ชันที่ใช้:

| Function | หน้าที่ |
|---|---|
| `line-auth` | ตรวจ LINE ID token แล้วสร้าง Supabase Auth session และโปรไฟล์ผู้ขอใช้รถที่เปิดใช้งานทันที |
| `line-notify` | รับคำสั่งจากเว็บแอปแล้วส่งข้อความสถานะ/งานใหม่ผ่าน LINE |
| `line-webhook` | รับ event จาก LINE, บันทึกกลุ่มลง `line_groups` อัตโนมัติ และตอบ Group ID เมื่อพิมพ์ `/groupid` |
| `daily-summary` | สรุปงานวันถัดไป ส่งเวลา 16:00 น. (Asia/Bangkok) ให้กลุ่ม คนขับ ผู้เกี่ยวข้อง และผู้ขอ |
| `trip-reminders` | ตรวจทุก 5 นาที แจ้งคนขับก่อน 30/10 นาที และแจ้งผู้เกี่ยวข้องก่อน 10 นาที |

## 1. สร้าง LINE Messaging API Channel

1. เข้า https://developers.line.biz/console/ สร้าง Provider + Messaging API Channel
2. คัดลอก **Channel access token (long-lived)** จากแท็บ Messaging API
3. เชิญบอทเข้ากลุ่ม LINE กลางของฝ่ายการศึกษา
4. เอา **Group ID** (`C` ขึ้นต้น) จาก webhook event `groupId` หรือใช้ LINE Official Account Manager
5. (สำหรับคนขับฝ่ายเรา) เอา **User ID** (`U` ขึ้นต้น) ของคนขับแต่ละคน แล้วบันทึกในตาราง `drivers.line_user_id`

> ระบบมี `line-webhook` สำหรับรับ event แล้ว: เมื่อบอทเข้ากลุ่มหรือมีคนพิมพ์ `/groupid`
> บอทจะตอบ Group ID และบันทึกกลุ่มลงตาราง `line_groups` ให้จัดการต่อในหน้าเว็บได้ทันที

## 2. ตั้งค่า Secrets

```bash
supabase login
supabase link --project-ref ccflyjycsfwnpfgkhpoy

supabase secrets set \
  LINE_CHANNEL_ACCESS_TOKEN="<channel access token>" \
  LINE_GROUP_ID="<group id>" \
  LINE_ADMIN_USER_IDS="<admin LINE user id>,<admin LINE user id>" \
  CRON_SECRET="<random string>"
```

`SUPABASE_URL` และ `SUPABASE_SERVICE_ROLE_KEY` ถูก inject ให้ Edge Function อัตโนมัติ
`LINE_ADMIN_USER_IDS` เป็น LINE User ID ของผู้ดูแลระบบที่ต้องการรับข้อความเมื่อมีสมาชิกใหม่ คั่นหลายบัญชีด้วยเครื่องหมายจุลภาค
หากใช้ LINE Login ให้เพิ่ม `LINE_LOGIN_CHANNEL_ID` (เช่น `2012159727`) โดยไม่ใส่ LIFF ID หรือ Messaging API token:

```bash
supabase secrets set LINE_LOGIN_CHANNEL_ID=2012159727
```

## 3. Deploy และอัปเดตฐานข้อมูล

รัน migration `supabase/migrations/20261104010000_workflow_approval_roles.sql` ใน Supabase SQL Editor หลัง migration LINE Login เดิม เพื่อเพิ่มการคำนวณเส้นทางอนุมัติและจำกัดสิทธิ์ Admin/หัวหน้าฝ่าย

จากนั้น deploy Edge Functions:

```bash
supabase functions deploy line-notify
supabase functions deploy line-webhook
supabase functions deploy daily-summary
supabase functions deploy trip-reminders
supabase functions deploy line-auth
```

> หลัง deploy แล้ว กลุ่ม LINE สามารถเพิ่ม/แก้ไข/ตั้งกลุ่มเริ่มต้นได้จากเมนู **กลุ่ม LINE** ในหน้า Admin
> โดยไม่ต้องตั้ง secret ใหม่ (ระบบอ่านกลุ่มเริ่มต้นจากตาราง `line_groups` และใช้ `LINE_GROUP_ID` เป็นตัวสำรอง)

ทดสอบเรียก:

```bash
curl -i -X POST "https://ccflyjycsfwnpfgkhpoy.supabase.co/functions/v1/line-notify" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"type":"raw","text":"ทดสอบระบบแจ้งเตือน"}'
```

## 4. ตั้งเวลา 16:00 น. และแจ้งเตือนก่อนเดินทาง ด้วย pg_cron + pg_net

รันใน SQL Editor (แทน `<SERVICE_ROLE_KEY>` และ `<CRON_SECRET>`):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ลบ schedule เดิมก่อน (ถ้ามี)
select cron.unschedule(jobid)
from cron.job
where jobname in ('line-daily-summary', 'line-trip-reminders');

-- สรุปงานวันถัดไป เวลา 16:00 น. (09:00 UTC)
select cron.schedule(
  'line-daily-summary',
  '0 9 * * *',
  $$
  select net.http_post(
    url := 'https://ccflyjycsfwnpfgkhpoy.supabase.co/functions/v1/daily-summary',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ตรวจแจ้งเตือนก่อนเดินทางทุก 5 นาที
select cron.schedule(
  'line-trip-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://ccflyjycsfwnpfgkhpoy.supabase.co/functions/v1/trip-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>',
      'x-cron-secret', '<CRON_SECRET>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

ตรวจสอบ/ลบ schedule:

```sql
select jobid, jobname, schedule, active from cron.job;
select cron.unschedule('line-daily-summary');
select cron.unschedule('line-trip-reminders');
```

## 5. พฤติกรรมการแจ้งเตือน

- **ยื่นคำขอสำเร็จ** → ส่ง Flex Message ยืนยันให้ผู้ขอทาง LINE ส่วนตัว และส่งรายการใหม่เข้า LINE กลุ่มกลาง
- **เข้าสู่ระบบ LINE ครั้งแรก** → สร้างบัญชี `requester` ที่ใช้งานได้ทันที และส่ง Flex Message ไปยัง `LINE_ADMIN_USER_IDS` เมื่อกำหนดค่าไว้
- **จัดสรรคนขับฝ่ายเรา** → ส่งงานเข้าข้อความส่วนตัวของคนขับ (ถ้ามี `line_user_id`)
- **จัดสรรคนขับฝ่ายอื่น/ยังไม่ผูก LINE** → ส่งเข้ากลุ่มกลางเท่านั้น
- **อนุมัติ/ไม่อนุมัติ** → ส่งผลและรายละเอียดการจัดสรรเข้าข้อความส่วนตัวของผู้ขอ
- **Admin กดแจ้ง LINE จากตารางคำขอหรือบันทึกการแก้ไข** → ส่งสถานะล่าสุดให้ผู้ขอ คนขับที่เชื่อม LINE ผู้เกี่ยวข้อง และกลุ่มฝ่าย
- **16:00 น.** → `daily-summary` รวมงานที่อนุมัติแล้วของวันถัดไป ส่งเข้ากลุ่มเริ่มต้น ส่วนตัวให้คนขับ ผู้เกี่ยวข้อง และผู้ขอ
- **ก่อนเริ่ม 30 นาที** → `trip-reminders` แจ้งพนักงานขับรถ
- **ก่อนเริ่ม 10 นาที** → แจ้งพนักงานขับรถ และผู้ที่เกี่ยวข้องในคำขอ (กันส่งซ้ำด้วยตาราง `trip_reminder_log`)
- **สีสถานะ** → ฟ้า = รอตรวจสอบ, ส้ม = รอ ผอ.เขต, เขียว = อนุมัติแล้ว, แดง = ไม่อนุมัติ, เทา = ยกเลิก (ใช้เหมือนกันทั้งเว็บและ LINE)

## 6. LINE Login และความปลอดภัย

- ตั้งค่า `LINE_LOGIN_CHANNEL_ID` แล้ว deploy `line-auth` เพื่อให้ฟังก์ชันตรวจ ID token กับ LINE ก่อนเชื่อมบัญชี
- `line-notify` ต้องได้รับ Supabase Auth access token ของบัญชีที่อนุมัติแล้ว และตรวจสิทธิ์จาก request ที่บันทึกจริง
- การส่งข้อความดิบหรือกำหนดผู้รับเองผ่าน `line-notify` ไม่อนุญาต
- `daily-summary` สำหรับ cron ต้องส่ง `CRON_SECRET` ผ่าน header `x-cron-secret`; การกดส่งสรุปจากหน้าเว็บอนุญาตเฉพาะ Admin ที่เข้าสู่ระบบแล้ว
- ห้ามใส่ Channel Access Token, LINE Login Channel secret หรือ Supabase service role key ใน frontend หรือ commit ลง repository
