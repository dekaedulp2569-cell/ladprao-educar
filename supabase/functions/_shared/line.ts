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

export function groupId() {
  return Deno.env.get('LINE_GROUP_ID') || ''
}

/** ส่งข้อความตัวอักษร 1 ข้อความไปยัง userId หรือ groupId */
export async function pushText(to: string | undefined | null, text: string) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!token) {
    return { ok: false, skipped: true, reason: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN' }
  }
  if (!to) {
    return { ok: false, skipped: true, reason: 'ไม่พบผู้รับข้อความ (to)' }
  }

  const response = await fetch(PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
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

export function formatThaiDate(value?: string | Date | null) {
  if (!value) return '-'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export function formatThaiDateTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatThaiTime(value?: string | null) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export const STATUS_LABEL: Record<string, string> = {
  pending: 'รอตรวจสอบ',
  tentative: 'รอ ผอ.เขต อนุมัติ',
  approved: 'อนุมัติแล้ว (ล็อกคิว)',
  rejected: 'ไม่อนุมัติ',
}

export type CarRequestPayload = {
  doc_number?: string
  requester_name?: string
  requester_position?: string
  requester_department?: string
  destination?: string
  destination_province?: string
  start_datetime?: string
  end_datetime?: string
  passenger_count?: number
  status?: string
  external_car_info?: string | null
  external_driver_name?: string | null
}

export function buildStatusMessage(request: CarRequestPayload, statusLabel: string) {
  return [
    '🚗 ระบบขอใช้รถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
    `เลขที่เอกสาร: ${request.doc_number || '-'}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `วันเวลา: ${formatThaiDateTime(request.start_datetime)} - ${formatThaiTime(request.end_datetime)} น.`,
    `สถานะล่าสุด: ${statusLabel}`,
  ].join('\n')
}

export function buildDriverMessage(request: CarRequestPayload, carLabel: string) {
  return [
    '📋 งานใหม่ที่ได้รับมอบหมาย',
    `วันที่: ${formatThaiDateTime(request.start_datetime)} - ${formatThaiTime(request.end_datetime)} น.`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `รถ: ${carLabel}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ผู้โดยสาร: ${request.passenger_count ?? '-'} คน`,
  ].join('\n')
}
