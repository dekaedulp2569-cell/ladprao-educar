// ฟังก์ชันกลางสำหรับเรียก LINE Messaging API จาก Supabase Edge Functions
// ต้องตั้งค่า secret: LINE_CHANNEL_ACCESS_TOKEN และ LINE_GROUP_ID

const PUSH_ENDPOINT = 'https://api.line.me/v2/bot/message/push'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8' },
  })
}

export function lineReady() {
  return Boolean(Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN'))
}

export function isValidLineId(id?: string | null): boolean {
  if (!id) return false
  return /^[CUR][0-9a-f]{32}$/i.test(id.trim())
}

export function groupId() {
  const gid = Deno.env.get('LINE_GROUP_ID')?.trim() || ''
  return isValidLineId(gid) ? gid : ''
}

/** ส่งข้อความตัวอักษร 1 ข้อความไปยัง userId หรือ groupId */
export async function pushText(to: string | undefined | null, text: string) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!token) {
    return { ok: false, skipped: true, reason: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN' }
  }
  if (!to || !isValidLineId(to)) {
    return { ok: false, skipped: true, reason: 'LINE ID ผู้รับไม่ถูกต้องหรือไม่พบผู้รับ (to)' }
  }

  const response = await fetch(PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text: text.slice(0, 4900) }],
    }),
  })

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      status: response.status,
      detail: await response.text(),
    }
  }
  return { ok: true, skipped: false }
}

export async function pushFlex(
  to: string | undefined | null,
  altText: string,
  contents: Record<string, unknown>,
) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!token) {
    return { ok: false, skipped: true, reason: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN' }
  }
  if (!to || !isValidLineId(to)) {
    return { ok: false, skipped: true, reason: 'LINE ID ผู้รับไม่ถูกต้องหรือไม่พบผู้รับ (to)' }
  }

  const response = await fetch(PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + token,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'flex', altText: altText.slice(0, 400), contents }],
    }),
  })

  if (!response.ok) {
    return {
      ok: false,
      skipped: false,
      status: response.status,
      detail: await response.text(),
    }
  }
  return { ok: true, skipped: false }
}

const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
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

function bangkokParts(value?: string | Date | null) {
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

/** 04 พ.ย. 2569 */
export function formatThaiDate(value?: string | Date | null) {
  const parts = bangkokParts(value)
  if (!parts) return '-'
  return `${parts.day} ${THAI_MONTHS_SHORT[parts.month - 1]} ${parts.year}`
}

/** 04 พ.ย. 2569 เวลา 08:00 น. */
export function formatThaiDateTime(value?: string | Date | null) {
  const parts = bangkokParts(value)
  if (!parts) return '-'
  return `${formatThaiDate(value)} เวลา ${parts.hour}:${parts.minute} น.`
}

/** 08:00 */
export function formatThaiTime(value?: string | Date | null) {
  const parts = bangkokParts(value)
  if (!parts) return '-'
  return `${parts.hour}:${parts.minute}`
}

/**
 * ช่วงเวลาแบบไทย
 * วันเดียวกัน: 04 พ.ย. 2569 เวลา 08:00 - 12:00 น.
 * คนละวัน: 04 พ.ย. 2569 เวลา 08:00 น. - 05 พ.ย. 2569 เวลา 12:00 น.
 */
export function formatThaiDateTimeRange(
  start?: string | Date | null,
  end?: string | Date | null,
) {
  const startParts = bangkokParts(start)
  const endParts = bangkokParts(end)
  if (!startParts) return '-'
  if (!endParts) return formatThaiDateTime(start)

  const sameDay =
    startParts.day === endParts.day &&
    startParts.month === endParts.month &&
    startParts.year === endParts.year

  if (sameDay) {
    return `${formatThaiDate(start)} เวลา ${startParts.hour}:${startParts.minute} - ${endParts.hour}:${endParts.minute} น.`
  }
  return `${formatThaiDateTime(start)} - ${formatThaiDateTime(end)}`
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'รอตรวจสอบ',
  tentative: 'รอ ผอ.เขต อนุมัติ',
  approved: 'อนุมัติแล้ว (ล็อกคิว)',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิกคำขอใช้รถ',
}

export type CarRequestPayload = {
  doc_number?: string
  requester_name?: string
  requester_position?: string
  requester_department?: string
  phone?: string
  destination?: string
  destination_province?: string
  start_datetime?: string
  end_datetime?: string
  passenger_count?: number
  status?: string
  approval_type?: string
  external_car_info?: string | null
  external_driver_name?: string | null
}

export function buildStatusMessage(request: CarRequestPayload, statusLabel: string) {
  return [
    '🚗 ระบบขอใช้รถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
    `เลขที่เอกสาร: ${request.doc_number || '-'}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `วันเวลา: ${formatThaiDateTimeRange(request.start_datetime, request.end_datetime)}`,
    `สถานะล่าสุด: ${statusLabel}`,
  ].join('\n')
}

export function buildDriverMessage(request: CarRequestPayload, carLabel: string) {
  return [
    '📋 งานใหม่ที่ได้รับมอบหมาย',
    `วันเวลา: ${formatThaiDateTimeRange(request.start_datetime, request.end_datetime)}`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `รถ: ${carLabel}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ผู้โดยสาร: ${request.passenger_count ?? '-'} คน`,
  ].join('\n')
}
