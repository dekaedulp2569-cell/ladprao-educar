// Supabase Edge Function: line-notify
// รับคำสั่งจากเว็บแอปแล้วส่งข้อความผ่าน LINE Messaging API
//
// ต้องตั้งค่า secrets ก่อน deploy:
//   supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=... LINE_GROUP_ID=...
// deploy:
//   supabase functions deploy line-notify

import {
  STATUS_LABEL,
  buildDriverMessage,
  buildStatusMessage,
  corsHeaders,
  groupId,
  json,
  pushText,
  type CarRequestPayload,
} from '../_shared/line.ts'

type Payload = {
  type?: 'status' | 'driver_assigned' | 'raw'
  to?: string
  text?: string
  messages?: string[]
  statusLabel?: string
  request?: Record<string, unknown>
  driver?: {
    full_name?: string
    dept?: string
    line_user_id?: string | null
  } | null
  carLabel?: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let payload: Payload
  try {
    payload = (await req.json()) as Payload
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  const group = groupId()
  const request = (payload.request || {}) as CarRequestPayload
  const statusLabel =
    payload.statusLabel || STATUS_LABEL[String(request.status || '')] || 'อัปเดตสถานะ'

  try {
    if (payload.type === 'driver_assigned') {
      const driver = payload.driver
      const carLabel = payload.carLabel || request.external_car_info || 'ไม่ระบุรถ'
      const message = buildDriverMessage(request, carLabel)

      // คนขับฝ่ายเราได้รับข้อความส่วนตัว (ถ้ามี LINE User ID)
      if (driver?.dept === 'education' && driver.line_user_id) {
        const result = await pushText(driver.line_user_id, message)
        return json({ target: 'driver_private', result })
      }

      // คนขับฝ่ายอื่น / คนขับที่ยังไม่ผูก LINE → แจ้งเข้ากลุ่มกลางเท่านั้น
      const result = await pushText(group, message)
      return json({ target: 'group', result })
    }

    if (payload.type === 'raw') {
      const text = payload.messages?.join('\n\n') || payload.text || ''
      if (!text) return json({ error: 'ไม่มีข้อความให้ส่ง' }, 400)
      const result = await pushText(payload.to || group, text)
      return json({ target: payload.to ? 'user' : 'group', result })
    }

    // ค่าเริ่มต้น: แจ้งสถานะคำขอ (ส่งเข้ากลุ่มกลาง หรือ userId ที่ระบุ)
    const message = buildStatusMessage(request, statusLabel)
    const result = await pushText(payload.to || group, message)
    return json({ target: payload.to ? 'user' : 'group', result })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
})
