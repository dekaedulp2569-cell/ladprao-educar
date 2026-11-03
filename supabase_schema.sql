-- ==========================================
-- 1. สร้าง Extension สำหรับสุ่ม UUID (ถ้ายังไม่มี)
-- ==========================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 2. สร้างตาราง user_profiles (เก็บข้อมูลผู้ใช้ รองรับ LINE Login)
-- ==========================================
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,                -- ชื่อ-สกุล (เช่น นายรัชชานนท์ ประจงกิจ)
    position VARCHAR(255) NOT NULL,                 -- ตำแหน่ง (เช่น เจ้าพนักงานธุรการปฏิบัติงาน)
    department VARCHAR(255) NOT NULL,               -- สังกัด (เช่น ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว)
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'head_of_dept', 'driver', 'requester')),
    -- บทบาท: admin = แอดมินจัดการรถ, head_of_dept = หัวหน้าฝ่าย, driver = คนขับรถ, requester = ผู้ขอใช้รถ
    
    line_user_id VARCHAR(255) UNIQUE,               -- LINE User ID สำหรับกดเข้าสู่ระบบผ่าน LINE โดยไม่ต้องกรอกรหัส
    email VARCHAR(255),
    phone VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==========================================
-- 3. สร้างตาราง cars (ข้อมูลรถราชการ)
-- ==========================================
CREATE TABLE cars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    license_plate VARCHAR(50) NOT NULL,            -- เลขทะเบียนรถ เช่น ฮว 4098
    province VARCHAR(100) DEFAULT 'กรุงเทพมหานคร', -- จังหวัด
    car_type VARCHAR(20) CHECK (car_type IN ('van', 'pickup', 'other')), -- ประเภทรถ (รถตู้, รถกระบะ)
    owner_dept VARCHAR(20) DEFAULT 'education' CHECK (owner_dept IN ('education', 'external')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่มข้อมูลรถเริ่มต้น 2 คัน
INSERT INTO cars (license_plate, province, car_type, owner_dept) 
VALUES 
    ('ฮว 4098', 'กรุงเทพมหานคร', 'van', 'education'),
    ('กข 1234', 'กรุงเทพมหานคร', 'pickup', 'education');

-- ==========================================
-- 4. สร้างตาราง drivers (ข้อมูลพนักงานขับรถ)
-- ==========================================
CREATE TABLE drivers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name VARCHAR(255) NOT NULL,               -- ชื่อ-สกุล เช่น นายสิทธิชัย อนุกูล
    nickname VARCHAR(100),                          -- ชื่อเล่น
    dept VARCHAR(20) DEFAULT 'education' CHECK (dept IN ('education', 'external')),
    line_user_id VARCHAR(255),                      -- LINE User ID สำหรับยิงแจ้งเตือนส่วนตัว
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- เพิ่มข้อมูลคนขับเริ่มต้น 2 คน
INSERT INTO drivers (full_name, nickname, dept) 
VALUES 
    ('นายสิทธิชัย อนุกูล', 'สิทธิชัย', 'education'),
    ('พนักงานขับรถ ท่านที่ 2', 'คนขับ 2', 'education');

-- ==========================================
-- 5. สร้างตาราง car_requests (บันทึกใบขอใช้รถ - อ้างอิงตามรูปแบบฟอร์ม)
-- ==========================================
CREATE TABLE car_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- ข้อมูลผู้ขอ (บันทึกแบบแยกฟิลด์เพื่อให้แสดงผล ชื่อ / ตำแหน่ง / สังกัด ได้ถูกต้อง)
    requester_name VARCHAR(255) NOT NULL,           -- ชื่อ-สกุล
    requester_position VARCHAR(255) NOT NULL,       -- ตำแหน่ง
    requester_department VARCHAR(255) NOT NULL,     -- สังกัด
    phone VARCHAR(50),                              -- เบอร์โทรศัพท์
    
    doc_type VARCHAR(20) CHECK (doc_type IN ('school_letter', 'dept_form')), -- ประเภทเอกสาร
    doc_number VARCHAR(100) NOT NULL,               -- เลขที่หนังสือ / เลขที่ใบขอใช้รถ

    -- รายละเอียดการเดินทาง
    destination TEXT NOT NULL,                      -- สถานที่ไป / วัตถุประสงค์
    destination_province VARCHAR(100) DEFAULT 'กรุงเทพมหานคร', -- จังหวัดปลายทาง
    start_datetime TIMESTAMPTZ NOT NULL,            -- วัน-เวลาเริ่มต้น
    end_datetime TIMESTAMPTZ NOT NULL,              -- วัน-เวลาสิ้นสุด
    passenger_count INT DEFAULT 1,                  -- จำนวนคนนั่ง
    purpose TEXT,

    -- ส่วนการจัดสรรทรัพยากรโดย Admin
    assigned_car_id UUID REFERENCES cars(id) ON DELETE SET NULL,
    external_car_info VARCHAR(255),
    assigned_driver_id UUID REFERENCES drivers(id) ON DELETE SET NULL,
    external_driver_name VARCHAR(255),

    -- สถานะและการตรวจสอบเงื่อนไขอนุมัติ
    is_out_of_hours BOOLEAN DEFAULT FALSE,          -- นอกเวลา (<08:00 หรือ >16:00)
    is_out_of_bkk BOOLEAN DEFAULT FALSE,            -- ออกนอก กทม.
    
    approval_type VARCHAR(50) CHECK (approval_type IN ('head_of_dept', 'district_director')),
    -- head_of_dept = หัวหน้าฝ่ายการศึกษา ปฏิบัติราชการแทน ผอ.เขต
    -- district_director = ผอ.เขตลาดพร้าว ปฏิบัติราชการแทน ปลัด กทม.

    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'tentative', 'approved', 'rejected')),
    director_approval_status VARCHAR(20) DEFAULT 'not_required' CHECK (director_approval_status IN ('not_required', 'pending', 'approved', 'rejected')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับเร่งความเร็วในการค้นหา
CREATE INDEX idx_car_requests_dates ON car_requests (start_datetime, end_datetime);
CREATE INDEX idx_user_profiles_line_id ON user_profiles (line_user_id);