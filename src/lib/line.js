// ชั้นเชื่อมต่อ LINE Messaging API
// GitHub Pages เป็น static site จึงยิง LINE โดยตรงไม่ได้ (จะเปิดเผย Channel Access Token)
// ต้อง deploy Supabase Edge Function `line-notify` แล้วเรียกผ่านฟังก์ชันนี้
//
// ตั้งค่า secrets ที่ Supabase Edge Function:
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID
//
// หากยังไม่ได้ตั้งค่า ฟังก์ชันจะคืน { skipped: true } เพื่อไม่ให้การบันทึกข้อมูลล้มเหลว

import { supabase } from './supabase'
import { formatDate, formatTime } from './helpers'

export async function notifyLine(payload) {
  try {
    const { data, error } = await supabase.functions.invoke('line-notify', {
      body: payload,
    })
    if (error) {
      console.warn('LINE notify ยังไม่พร้อมใช้งาน:', error.message)
      return { skipped: true }
    }
    return data
  } catch (error) {
    console.warn('LINE notify ยังไม่พร้อมใช้งาน:', error)
    return { skipped: true }
  }
}

export function buildStatusMessage(request, statusLabel) {
  const lines = [
    '🚗 ระบบขอใช้รถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
    `เลขที่เอกสาร: ${request.doc_number || '-'}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `วันเวลา: ${formatDate(request.start_datetime, true)} - ${formatTime(request.end_datetime)} น.`,
    `สถานะล่าสุด: ${statusLabel}`,
  ]
  return lines.join('\n')
}

export function buildDriverMessage(request, carLabel) {
  const lines = [
    '📋 งานใหม่ที่ได้รับมอบหมาย',
    `วันที่: ${formatDate(request.start_datetime, true)} - ${formatTime(request.end_datetime)} น.`,
    `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`,
    `รถ: ${carLabel || '-'}`,
    `ผู้ขอ: ${request.requester_name || '-'}`,
    `ผู้โดยสาร: ${request.passenger_count ?? '-'} คน`,
  ]
  return lines.join('\n')
}
