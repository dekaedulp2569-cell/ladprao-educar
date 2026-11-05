// LINE Messaging API webhook — ใช้สำหรับดึง Group ID และตอบกลับในกลุ่ม
// ตั้งค่า Webhook URL: https://<project-ref>.supabase.co/functions/v1/line-webhook
// ต้องตั้ง verify_jwt = false ใน supabase/config.toml

const REPLY_ENDPOINT = 'https://api.line.me/v2/bot/message/reply'

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
      const event = rawEvent as {
        type?: string
        replyToken?: string
        source?: { type?: string; groupId?: string; roomId?: string; userId?: string }
        message?: { text?: string }
      }
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

      if (wantsGroupId && event.replyToken) {
        await replyText(
          event.replyToken,
          [
            'EduLP Car • LINE Group ID',
            groupId,
            '',
            'คัดลอก ID นี้ไปตั้งค่า LINE_GROUP_ID ในระบบ (ขึ้นต้นด้วย C)',
          ].join('\n'),
        )
      }
    }),
  )

  return new Response('ok', { status: 200 })
})
