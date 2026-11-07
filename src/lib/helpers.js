// รวมฟังก์ชันช่วยเหลือที่ใช้ร่วมกันทั่วทั้งแอป

// สีสถานะกลาง ใช้ร่วมกันทั้งเว็บและ LINE เพื่อให้ทุกขั้นตอนสื่อความหมายเดียวกัน
// ฟ้า = รอตรวจสอบ, เหลือง/ส้ม = รอ ผอ.เขต, เขียว = อนุมัติแล้ว,
// แดง = ไม่อนุมัติ, เทา = ยกเลิกแล้ว
export const STATUS = {
  pending: {
    label: 'รอตรวจสอบ',
    short: 'รอตรวจสอบ',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
    dot: 'bg-sky-500',
    tone: 'sky',
    emoji: '🔵',
    hex: '#0284C7',
  },
  tentative: {
    label: 'รอ ผอ.เขต อนุมัติ',
    short: 'รอ ผอ.เขต',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    dot: 'bg-amber-500',
    tone: 'amber',
    emoji: '🟠',
    hex: '#D97706',
  },
  approved: {
    label: 'อนุมัติแล้ว (ล็อกคิว)',
    short: 'อนุมัติแล้ว',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    dot: 'bg-emerald-500',
    tone: 'emerald',
    emoji: '🟢',
    hex: '#059669',
  },
  rejected: {
    label: 'ไม่อนุมัติ',
    short: 'ไม่อนุมัติ',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
    dot: 'bg-rose-500',
    tone: 'rose',
    emoji: '🔴',
    hex: '#E11D48',
  },
  cancelled: {
    label: 'ยกเลิกแล้ว',
    short: 'ยกเลิกแล้ว',
    className: 'bg-slate-100 text-slate-600 border-slate-300',
    dot: 'bg-slate-500',
    tone: 'slate',
    emoji: '⚫',
    hex: '#475569',
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

// ประเภทรถราชการ — ตอนเพิ่มรถให้พิมพ์ระบุเอง (ข้อความอิสระ) เพื่อให้ตรงกับเอกสารทางราชการ
// CAR_TYPE ใช้เป็นคำแนะนำ/ตัวอย่างเท่านั้น ระบบอนุญาตให้ระบุข้อความใดก็ได้
export const CAR_TYPE = {
  van: 'รถตู้',
  pickup: 'รถกระบะ',
  sedan: 'รถเก๋ง',
  bus: 'รถโดยสาร (รถบัส)',
  other: 'รถอื่น ๆ',
}

/** ตัวเลือกตัวอย่างสำหรับแสดงใน UI (ไม่บังคับเลือกจากลิสต์) */
export const CAR_TYPE_OPTIONS = Object.entries(CAR_TYPE).map(([value, label]) => ({
  value,
  label,
}))

/** แปลงรหัสประเภทรถเป็นข้อความแสดงผล (รองรับข้อความอิสระที่พิมพ์เอง) */
export function carTypeDisplay(value) {
  if (!value) return 'รถ'
  return CAR_TYPE[value] || value
}

/** แปลงตัวเลขอารบิกเป็นเลขไทย */
export function toThaiDigits(value) {
  if (value === null || value === undefined) return ''
  const thaiDigits = ['๐', '๑', '๒', '๓', '๔', '๕', '๖', '๗', '๘', '๙']
  return String(value).replace(/[0-9]/g, (digit) => thaiDigits[Number(digit)])
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

/**
 * จัดรูปแบบชื่อจังหวัดตามระเบียบงานสารบรรณ
 * จังหวัดทั่วไป: ใส่ "จ." นำหน้า เช่น "จ.สมุทรปราการ", "จ.ชลบุรี"
 * ยกเว้น กรุงเทพมหานคร: ไม่มี "จ." ให้แสดง "กรุงเทพมหานคร"
 */
export function formatProvince(province) {
  if (!province) return ''
  const trimmed = String(province).trim()
  if (!trimmed) return ''
  if (
    trimmed === 'กรุงเทพมหานคร' ||
    trimmed === 'กรุงเทพฯ' ||
    trimmed === 'กทม.' ||
    trimmed === 'กทม'
  ) {
    return 'กรุงเทพมหานคร'
  }
  if (trimmed.startsWith('จ.') || trimmed.startsWith('จังหวัด')) {
    return trimmed
  }
  return `จ.${trimmed}`
}

/**
 * รวมข้อความปลายทางและจังหวัด
 * ถ้าใน destination มีชื่อจังหวัดอยู่แล้ว จะไม่ใส่ซ้ำ
 * ถ้ามี (จังหวัด) อยู่ จะแปลงเป็น จ.จังหวัด
 */
export function formatDestinationWithProvince(destination, province) {
  let dest = String(destination || '').trim()
  const prov = formatProvince(province)
  if (!prov) return dest
  if (!dest) return prov

  const rawProv = String(province || '').trim()
  // ถ้ามีวงเล็บชื่อจังหวัด เช่น (สมุทรปราการ) ให้เปลี่ยนเป็น prov
  if (dest.includes(`(${rawProv})`)) {
    return dest.replace(`(${rawProv})`, prov).trim()
  }

  // ถ้ามีชื่อจังหวัดหรือ prov อยู่แล้ว ไม่ต้องต่อท้ายซ้ำ
  if (
    dest.includes(prov) ||
    dest.includes(rawProv) ||
    (rawProv === 'กรุงเทพมหานคร' && (dest.includes('กทม') || dest.includes('กรุงเทพ')))
  ) {
    return dest
  }

  return `${dest} ${prov}`
}

/** ตรวจว่าช่วงเดินทางมีวันเสาร์หรืออาทิตย์อย่างน้อยหนึ่งวันหรือไม่ */
export function includesWeekend(startLocal, endLocal) {
  if (!startLocal || !endLocal) return false
  const start = new Date(startLocal)
  const end = new Date(endLocal)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return false

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate())
  while (cursor <= last) {
    if (cursor.getDay() === 0 || cursor.getDay() === 6) return true
    cursor.setDate(cursor.getDate() + 1)
  }
  return false
}

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

export const THAI_MONTHS_LONG = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

const BKK_DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Asia/Bangkok',
})

const BKK_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Bangkok',
})

/** แปลงวันที่เป็นส่วนประกอบตามเวลาไทย (พ.ศ.) */
export function bangkokParts(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const dateParts = Object.fromEntries(
    BKK_DATE_FORMAT.formatToParts(date).map((part) => [part.type, part.value]),
  )
  const timeParts = Object.fromEntries(
    BKK_TIME_FORMAT.formatToParts(date).map((part) => [part.type, part.value]),
  )
  return {
    day: dateParts.day,
    month: Number(dateParts.month),
    year: Number(dateParts.year) + 543,
    hour: timeParts.hour === '24' ? '00' : timeParts.hour,
    minute: timeParts.minute,
  }
}

/**
 * แสดงวันที่แบบไทย เช่น 04 พ.ย. 2569
 * ถ้า withTime = true จะได้ 04 พ.ย. 2569 เวลา 08:00 น.
 */
export function formatDate(value, withTime = false) {
  const parts = bangkokParts(value)
  if (!parts) return '-'
  const base = `${parts.day} ${THAI_MONTHS_SHORT[parts.month - 1]} ${parts.year}`
  return withTime ? `${base} เวลา ${parts.hour}:${parts.minute} น.` : base
}

/** แสดงเวลาแบบ 24 ชั่วโมงตามเวลาไทย เช่น 08:00 */
export function formatTime(value) {
  const parts = bangkokParts(value)
  if (!parts) return '-'
  return `${parts.hour}:${parts.minute}`
}

/**
 * ช่วงเวลาแบบไทย
 * วันเดียวกัน: 04 พ.ย. 2569 เวลา 08:00 - 12:00 น.
 * คนละวัน: 04 พ.ย. 2569 เวลา 08:00 น. - 05 พ.ย. 2569 เวลา 12:00 น.
 */
export function formatDateTimeRange(start, end) {
  if (!start && !end) return '-'
  if (!start) return formatDate(end, true)
  if (!end) return formatDate(start, true)
  if (dateKey(start) === dateKey(end)) {
    return `${formatDate(start)} เวลา ${formatTime(start)} - ${formatTime(end)} น.`
  }
  return `${formatDate(start, true)} - ${formatDate(end, true)}`
}

/** yyyy-mm-dd ของวันที่ตามเวลาไทย ใช้จัดกลุ่มปฏิทิน */
export function dateKey(value) {
  if (!value) return ''
  const date = value instanceof Date ? value : new Date(value)
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
  return `${THAI_MONTHS_LONG[month]} ${year + 543}`
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
