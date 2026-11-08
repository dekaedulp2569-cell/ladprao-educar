-- ==========================================
-- ขั้นที่ 6 (เพิ่ม): ดึงชื่อคนขับเทียบเท่าแอดมิน + แสดงชื่อคนขับในปฏิทิน/หน้าผู้ขอ
-- ==========================================
-- ปัญหาเดิม: assigned_driver_id ชี้ไปที่ user_profiles แต่หน้าผู้ใช้ยังดึงคนขับ
-- จากตาราง drivers เก่า → id ไม่แมตช์ → ชื่อคนขับในเอกสาร แบบ ๓ เป็นช่องว่าง

-- 1. view ไดเรกทอรีคนขับ: อ่านชื่อ/ตำแหน่ง/ฝ่ายได้ทั้งสาธารณะ (anon) และผู้ใช้ทั่วไป
--    ไม่เปิดข้อมูลส่วนตัวอื่น (โทรศัพท์ / line_user_id / อีเมล)
create or replace view public.driver_directory
with (security_barrier = true)
as
select
  id,
  full_name,
  nickname,
  position,
  department,
  driver_dept_type,
  status
from public.user_profiles
where role = 'driver';

grant select on public.driver_directory to anon, authenticated;

-- 2. view ปฏิทินสาธารณะ: เพิ่ม assigned_driver_id (ต่อท้ายคอลัมน์เดิม)
--    และคืนเงื่อนไข approved + tentative ให้ตรงกับหน้าเว็บ (ขั้นที่ 5)
create or replace view public.public_car_calendar
with (security_barrier = true)
as
select
  id,
  status,
  destination,
  destination_province,
  start_datetime,
  end_datetime,
  assigned_car_id,
  external_car_info,
  assigned_driver_id
from public.car_requests
where status in ('approved', 'tentative');

grant select on public.public_car_calendar to anon, authenticated;
