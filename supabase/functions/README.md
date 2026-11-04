# Supabase Edge Functions — LINE Integration

ฟังก์ชันที่ใช้:

| Function | หน้าที่ |
|---|---|
| `line-auth` | ตรวจ LINE ID token แล้วสร้าง Supabase Auth session และโปรไฟล์ผู้ขอใช้รถที่เปิดใช้งานทันที |
| `line-notify` | รับคำสั่งจากเว็บแอปแล้วส่งข้อความสถานะ/งานใหม่ผ่าน LINE |
| `daily-summary` | สรุปงานของพนักงานขับรถวันถัดไป ส่งเวลา 15:00 น. (Asia/Bangkok) |

## 1. สร้าง LINE Messaging API Channel

1. เข้า https://developers.line.biz/console/ สร้าง Provider + Messaging API Channel
2. คัดลอก **Channel access token (long-lived)** จากแท็บ Messaging API
3. เชิญบอทเข้ากลุ่ม LINE กลางของฝ่ายการศึกษา
4. เอา **Group ID** (`C` ขึ้นต้น) จาก webhook event `groupId` หรือใช้ LINE Official Account Manager
5. (สำหรับคนขับฝ่ายเรา) เอา **User ID** (`U` ขึ้นต้น) ของคนขับแต่ละคน แล้วบันทึกในตาราง `drivers.line_user_id`

> การรับ Group ID/User ID อัตโนมัติต้องเปิด Webhook และมี endpoint รับ event ซึ่งยังไม่อยู่ในขอบเขตเฟสนี้

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
supabase functions deploy daily-summary
supabase functions deploy line-auth
```

ทดสอบเรียก:

```bash
curl -i -X POST "https://ccflyjycsfwnpfgkhpoy.supabase.co/functions/v1/line-notify" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"type":"raw","text":"ทดสอบระบบแจ้งเตือน"}'
```

## 4. ตั้งเวลา 15:00 น. ด้วย pg_cron + pg_net

รันใน SQL Editor (แทน `<SERVICE_ROLE_KEY>` และ `<CRON_SECRET>`):

```sql
select cron.unschedule(jobid)
from cron.job
where jobname = 'line-daily-summary';

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'line-daily-summary',
  '0 8 * * *', -- 08:00 UTC = 15:00 Asia/Bangkok
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
```

ตรวจสอบ/ลบ schedule:

```sql
select * from cron.job;
select cron.unschedule('line-daily-summary');
```

## 5. พฤติกรรมการแจ้งเตือน

- **ยื่นคำขอสำเร็จ** → ส่ง Flex Message รายการใหม่เข้า LINE กลุ่มกลาง
- **เข้าสู่ระบบ LINE ครั้งแรก** → สร้างบัญชี `requester` ที่ใช้งานได้ทันที และส่ง Flex Message ไปยัง `LINE_ADMIN_USER_IDS` เมื่อกำหนดค่าไว้
- **จัดสรรคนขับฝ่ายเรา** → ส่งงานเข้าข้อความส่วนตัวของคนขับ (ถ้ามี `line_user_id`)
- **จัดสรรคนขับฝ่ายอื่น/ยังไม่ผูก LINE** → ส่งเข้ากลุ่มกลางเท่านั้น
- **อนุมัติ/ไม่อนุมัติ** → ส่งผลและรายละเอียดการจัดสรรเข้าข้อความส่วนตัวของผู้ขอ
- **15:00 น.** → `daily-summary` รวมงานวันถัดไป ส่งส่วนตัวให้คนขับฝ่ายเรา และสรุปตารางรถทั้งหมดเข้ากลุ่ม

## 6. LINE Login และความปลอดภัย

- ตั้งค่า `LINE_LOGIN_CHANNEL_ID` แล้ว deploy `line-auth` เพื่อให้ฟังก์ชันตรวจ ID token กับ LINE ก่อนเชื่อมบัญชี
- `line-notify` ต้องได้รับ Supabase Auth access token ของบัญชีที่อนุมัติแล้ว และตรวจสิทธิ์จาก request ที่บันทึกจริง
- การส่งข้อความดิบหรือกำหนดผู้รับเองผ่าน `line-notify` ไม่อนุญาต
- `daily-summary` สำหรับ cron ต้องส่ง `CRON_SECRET` ผ่าน header `x-cron-secret`; การกดส่งสรุปจากหน้าเว็บอนุญาตเฉพาะ Admin ที่เข้าสู่ระบบแล้ว
- ห้ามใส่ Channel Access Token, LINE Login Channel secret หรือ Supabase service role key ใน frontend หรือ commit ลง repository
