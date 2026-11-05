-- ==========================================
-- รวมจัดการคนขับเข้ากับ user_profiles
-- ==========================================

-- 1. เพิ่มฟิลด์ใหม่ใน user_profiles (ถ้ายังไม่มี)
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS driver_dept_type TEXT CHECK (driver_dept_type IN ('education', 'other')),
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive'));

-- 2. ย้ายข้อมูลคนขับจากตาราง drivers (ถ้ามี) มาไว้ใน user_profiles
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'drivers') THEN
    INSERT INTO public.user_profiles (full_name, nickname, position, department, phone, line_user_id, role, driver_dept_type, status, created_at)
    SELECT 
      d.full_name,
      d.nickname,
      'พนักงานขับรถ' AS position,
      CASE WHEN d.dept = 'education' THEN 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว' ELSE 'ฝ่ายอื่น / สำนักงานเขต' END AS department,
      '' AS phone,
      d.line_user_id,
      'driver' AS role,
      d.dept AS driver_dept_type,
      CASE WHEN d.is_active THEN 'active' ELSE 'inactive' END AS status,
      d.created_at
    FROM public.drivers d
    ON CONFLICT (line_user_id) DO NOTHING;
  END IF;
END $$;

-- 3. เพิ่มฟิลด์ใหม่ใน car_requests
ALTER TABLE public.car_requests
  ADD COLUMN IF NOT EXISTS pickup_location TEXT DEFAULT 'สำนักงานเขตลาดพร้าว',
  ADD COLUMN IF NOT EXISTS passenger_name TEXT,
  ADD COLUMN IF NOT EXISTS passenger_phone TEXT;

-- 4. ตรวจสอบผลลัพธ์
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'user_profiles' 
ORDER BY ordinal_position;

SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'car_requests' 
ORDER BY ordinal_position;
