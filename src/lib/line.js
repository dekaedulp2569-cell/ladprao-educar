// ชั้นเชื่อมต่อ LINE Messaging API
// GitHub Pages เป็น static site จึงยิง LINE โดยตรงไม่ได้ (จะเปิดเผย Channel Access Token)
// ต้อง deploy Supabase Edge Function `line-notify` แล้วเรียกผ่านฟังก์ชันนี้
//
// ตั้งค่า secrets ที่ Supabase Edge Function:
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID
//
// หากยังไม่ได้ตั้งค่า ฟังก์ชันจะคืน { skipped: true } เพื่อไม่ให้การบันทึกข้อมูลล้มเหลว

import { supabase } from './supabase'
import { formatDateTimeRange } from './helpers'

export { formatDateTimeRange }

async function getFunctionErrorReason(error) {
  const response = error?.context
  if (response instanceof Response) {
    try {
      const body = await response.clone().json()
      const reasons = [
        body.error,
        ...(body.missingRecipients || []),
        ...(body.notifications || [])
          .filter(({ result }) => !result?.ok)
          .map(({ target, result }) => {
            const detail = result?.detail || result?.reason
            const status = result?.status ? `HTTP ${result.status}` : ''
            return [target, status, detail].filter(Boolean).join(': ')
          }),
      ].filter(Boolean)
      if (reasons.length) return reasons.join(' · ')
    } catch {
      // The response body may not be JSON; use the function error message below.
    }
  }
  return error?.message || 'ไม่ทราบสาเหตุ'
}

export async function notifyLine(payload) {
  try {
    const { data, error } = await supabase.functions.invoke('line-notify', {
      body: payload,
    })
    if (error) {
      const reason = await getFunctionErrorReason(error)
      console.warn('LINE notify ยังไม่พร้อมใช้งาน:', reason)
      return { ok: false, skipped: true, reason }
    }
    return data
  } catch (error) {
    console.warn('LINE notify ยังไม่พร้อมใช้งาน:', error)
    return {
      ok: false,
      skipped: true,
      reason: await getFunctionErrorReason(error),
    }
  }
}

export function buildStatusMessage(request, statusLabel) {
  const lines = [
    '🚗 ระบบขอใช้รถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
    `เลขที่เอกสาร: ${request.doc_number || '-'}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `วันเวลา: ${formatDateTimeRange(request.start_datetime, request.end_datetime)}`,
    `สถานะล่าสุด: ${statusLabel}`,
  ]
  return lines.join('\n')
}

export function buildDriverMessage(request, carLabel) {
  const lines = [
    '📋 งานใหม่ที่ได้รับมอบหมาย',
    `วันเวลา: ${formatDateTimeRange(request.start_datetime, request.end_datetime)}`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `รถ: ${carLabel || '-'}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ผู้โดยสาร: ${request.passenger_count ?? '-'} คน`,
  ]
  return lines.join('\n')
}
