// รวมฟังก์ชันช่วยเหลือที่ใช้ร่วมกันทั่วทั้งแอป

export const STATUS = {
  pending: {
    label: 'รอตรวจสอบ',
    short: 'รอตรวจสอบ',
    className: 'bg-brand-50 text-brand-800 border-brand-200',
    dot: 'bg-brand-500',
  },
  tentative: {
    label: 'รอ ผอ.เขต อนุมัติ',
    short: 'รอ ผอ.เขต',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
  },
  approved: {
    label: 'อนุมัติแล้ว (ล็อกคิว)',
    short: 'อนุมัติแล้ว',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
  },
  rejected: {
    label: 'ไม่อนุมัติ',
    short: 'ไม่อนุมัติ',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
  },
}

export const APPROVAL_TYPE = {
  head_of_dept: {
    label: 'หัวหน้าฝ่ายการศึกษา',
    line: 'ปฏิบัติราชการแทน ผอ.เขตลาดพร้าว',
    document: 'หนังสือเรียน ผอ.เขตลาดพร้าว',
  },
  district_director: {
    label: 'ผอ.เขตลาดพร้าว',
    line: 'ปฏิบัติราชการแทน ปลัดกรุงเทพมหานคร',
    document: 'หนังสือเรียน ปลัดกรุงเทพมหานคร',
  },
}

export const DOC_TYPE = {
  school_letter: 'หนังสือขออนุญาตจากโรงเรียน',
  dept_form: 'ใบขอใช้รถฝ่ายการศึกษา',
}

export const ROLE = {
  requester: 'เจ้าหน้าที่ผู้ขอใช้รถ',
  admin: 'เจ้าหน้าที่จัดการรถ (Admin)',
  head_of_dept: 'หัวหน้าฝ่ายการศึกษา',
  driver: 'พนักงานขับรถ',
}

export const CAR_TYPE = {
  van: 'รถตู้',
  pickup: 'รถกระบะ',
  other: 'อื่น ๆ',
}

/** แปลง datetime-local (เวลาท้องถิ่น) เป็น ISO สำหรับ Supabase */
export function toISO(localValue) {
  if (!localValue) return null
  const date = new Date(localValue)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString()
}

/** ตรวจว่าช่วงเวลาที่ขอ อยู่นอกเวลาราชการ 08:00-16:00 หรือไม่ */
export function isOutOfHours(startLocal, endLocal) {
  if (!startLocal || !endLocal) return false
  const start = new Date(startLocal)
  const end = new Date(endLocal)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false

  const startMinutes = start.getHours() * 60 + start.getMinutes()
  const endMinutes = end.getHours() * 60 + end.getMinutes()

  // เริ่มก่อน 08:00 หรือสิ้นสุดหลัง 16:00 หรือข้ามวัน
  if (startMinutes < 8 * 60) return true
  if (endMinutes > 16 * 60) return true

  const sameDay =
    start.getFullYear() === end.getFullYear() &&
    start.getMonth() === end.getMonth() &&
    start.getDate() === end.getDate()
  if (!sameDay) return true

  return false
}

export function isOutOfBkk(province) {
  return province !== 'กรุงเทพมหานคร'
}

/** แสดงวันที่แบบไทย เช่น 3 พ.ย. 2569 */
export function formatDate(value, withTime = false) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const options = {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }
  if (withTime) {
    options.hour = '2-digit'
    options.minute = '2-digit'
  }
  return date.toLocaleString('th-TH', options)
}

export function formatTime(value) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
}

/** yyyy-mm-dd ของวันที่ตามเวลาไทย ใช้จัดกลุ่มปฏิทิน */
export function dateKey(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: 'Asia/Bangkok',
  }).format(date)
  return parts
}

export function monthLabel(year, month) {
  return new Date(year, month, 1).toLocaleDateString('th-TH', {
    month: 'long',
    year: 'numeric',
  })
}

/** ปีงบประมาณไทย: 1 ต.ค. - 30 ก.ย. */
export function fiscalYearOf(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getFullYear()
  const month = date.getMonth() // 0 = ม.ค.
  const startYear = month >= 9 ? year : year - 1
  return startYear + 543
}

export function fiscalYearRange(fiscalYearBE) {
  const startYear = fiscalYearBE - 543
  return {
    start: new Date(startYear, 9, 1, 0, 0, 0),
    end: new Date(startYear + 1, 9, 30, 23, 59, 59),
  }
}

export function currentFiscalYear() {
  return fiscalYearOf(new Date())
}

/** ตรวจช่วงเวลาทับซ้อนกัน */
export function overlaps(startA, endA, startB, endB) {
  return new Date(startA) < new Date(endB) && new Date(startB) < new Date(endA)
}

export function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

/** สร้าง CSV พร้อม BOM เพื่อให้ Excel อ่านภาษาไทยได้ */
export function downloadCsv(filename, rows) {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return `"${text.replace(/"/g, '""')}"`
  }
  const content = rows.map((row) => row.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
