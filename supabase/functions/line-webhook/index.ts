// LINE Messaging API webhook
// ใช้สำหรับดึง Group ID, บันทึกกลุ่มลงตาราง line_groups อัตโนมัติ และตอบกลับในกลุ่ม
//
// ตั้งค่า Webhook URL: https://<project-ref>.supabase.co/functions/v1/line-webhook
// ต้องตั้ง verify_jwt = false ใน supabase/config.toml

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply'

type LineEvent = {
  type?: string
  replyToken?: string
  source?: { type?: string; groupId?: string; roomId?: string; userId?: string }
  message?: { text?: string }
}

async function isValidSignature(body: string, signature: string | null) {
  const secret = Deno.env.get('LINE_MESSAGING_CHANNEL_SECRET')
  // ถ้ายังไม่ได้ตั้ง secret ให้รับ event ไว้ก่อน (ใช้เฉพาะช่วงตั้งค่า Group ID)
  if (!secret) return true
  if (!signature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)))
  let binary = ''
  for (const byte of digest) binary += String.fromCharCode(byte)
  return btoa(binary) === signature
}

async function replyText(replyToken: string, text: string) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!token) return
  const response = await fetch(REPLY_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  })
  if (!response.ok) {
    console.error('LINE webhook reply failed', {
      status: response.status,
      body: await response.text(),
    })
  }
}

async function groupName(groupId: string) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  if (!token) return ''
  try {
    const response = await fetch(`https://api.line.me/v2/bot/group/${groupId}/summary`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!response.ok) return ''
    const data = await response.json()
    return typeof data?.groupName === 'string' ? data.groupName : ''
  } catch {
    return ''
  }
}

/** บันทึกกลุ่มลงฐานข้อมูลเพื่อให้จัดการต่อได้ในหน้าเว็บ (ไม่แทนที่กลุ่มที่มีอยู่) */
async function rememberGroup(groupId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) return

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: existing, error: existingError } = await supabase
    .from('line_groups')
    .select('id')
    .eq('group_id', groupId)
    .maybeSingle()
  if (existingError) {
    console.error('Unable to check LINE group', existingError)
    return
  }
  if (existing) return

  const { count } = await supabase
    .from('line_groups')
    .select('id', { count: 'exact', head: true })

  const name = (await groupName(groupId)) || 'กลุ่ม LINE ใหม่'
  const { error } = await supabase.from('line_groups').insert({
    name,
    group_id: groupId,
    note: 'เพิ่มอัตโนมัติเมื่อบอทเข้ากลุ่ม',
    is_default: (count || 0) === 0,
  })
  if (error) console.error('Unable to save LINE group', error)
}

Deno.serve(async (req) => {
  if (req.method === 'GET') {
    return new Response('EduLP Car LINE webhook is running', { status: 200 })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const body = await req.text()
  if (!(await isValidSignature(body, req.headers.get('x-line-signature')))) {
    return new Response('Invalid signature', { status: 401 })
  }

  let payload: { events?: unknown[] }
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response('ok', { status: 200 })
  }

  const events = Array.isArray(payload.events) ? payload.events : []

  await Promise.all(
    events.map(async (rawEvent) => {
      const event = rawEvent as LineEvent
      const groupId = event.source?.groupId || event.source?.roomId
      const text = event.message?.text?.trim()

      console.log(
        'LINE webhook event',
        JSON.stringify({
          type: event.type,
          sourceType: event.source?.type,
          groupId,
          userId: event.source?.userId,
          text,
        }),
      )

      if (!groupId) return

      const wantsGroupId =
        event.type === 'join' || (event.type === 'message' && /^\/?groupid$/i.test(text || ''))

      if (wantsGroupId) {
        await rememberGroup(groupId)
        if (event.replyToken) {
          const name = await groupName(groupId)
          await replyText(
            event.replyToken,
            [
              'EduLP Car • LINE Group ID',
              groupId,
              name ? `กลุ่ม: ${name}` : '',
              '',
              'บันทึกเข้าระบบแล้ว — แอดมินสามารถตั้งเป็นกลุ่มเริ่มต้นได้ที่เมนู "กลุ่ม LINE"',
            ]
              .filter(Boolean)
              .join('\n'),
          )
        }
      }
    }),
  )

  return new Response('ok', { status: 200 })
})
