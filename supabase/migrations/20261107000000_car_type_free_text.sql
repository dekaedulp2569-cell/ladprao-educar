-- อนุญาตให้ระบุประเภทรถเป็นข้อความอิสระ (พิมพ์ระบุเอง)
-- เพื่อให้ข้อความในเอกสารตรงกับทางราชการ (เช่น รถตู้, รถกระบะ, รถบัส, ฯลฯ)
-- เดิมจำกัดเฉพาะ van / pickup / other เท่านั้น

ALTER TABLE public.cars
  DROP CONSTRAINT IF EXISTS cars_car_type_check;

ALTER TABLE public.cars
  ADD CONSTRAINT cars_car_type_check
  CHECK (car_type IS NULL OR length(car_type) > 0);

-- ตัวอย่างข้อมูลรถที่มีอยู่แล้วให้คงค่าเดิม (van, pickup) ระบบจะแสดงผลตามคำที่เก็บไว้
-- หากต้องการเปลี่ยนเป็นภาษาไทยเต็ม ให้แก้ไขผ่านหน้าเว็บในเมนู "รถและคนขับ"
