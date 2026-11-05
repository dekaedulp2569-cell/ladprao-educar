import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ALLOWED_ORIGINS = new Set([
  'https://dekaedulp2569-cell.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function headersFor(origin: string | null) {
  const allowedOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : ''
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function notifyAdminsOfNewMember(member: {
  full_name: string
  position: string
  department: string
}) {
  const token = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN')
  const recipients = Deno.env.get('LINE_ADMIN_USER_IDS')
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (!token || !recipients?.length) {
    console.warn('New LINE member notification skipped: admin LINE notification is not configured')
    return
  }

  const message = {
    type: 'flex',
    altText: 'มีผู้ใช้งานใหม่เข้าสู่ระบบ EduLP Car',
    contents: {
      type: 'bubble',
      styles: { header: { backgroundColor: '#D97706' } },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: 'EduLP Car • แจ้งเตือนแอดมิน', color: '#FEF3C7', size: 'xs', weight: 'bold' },
          { type: 'text', text: 'พบผู้ใช้งานใหม่เข้าสู่ระบบ', color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: `ชื่อ-สกุล: ${member.full_name}`, size: 'sm', weight: 'bold', color: '#1F2937', wrap: true },
          { type: 'text', text: `ตำแหน่ง: ${member.position}`, size: 'xs', color: '#4B5563', wrap: true },
          { type: 'text', text: `สังกัด: ${member.department}`, size: 'xs', color: '#4B5563', wrap: true },
          { type: 'text', text: 'สิทธิ์เริ่มต้น: Requester (ผู้ขอใช้รถ)', size: 'xs', color: '#D97706', weight: 'bold', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดระบบจัดการสมาชิก',
              uri: 'https://dekaedulp2569-cell.github.io/ladprao-educar/',
            },
            style: 'primary',
            color: '#D97706',
          },
        ],
      },
    },
  }

  const results = await Promise.all(
    recipients.map(async (to) => {
      const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to, messages: [message] }),
      })
      if (!response.ok) {
        console.error('New LINE member notification failed', {
          status: response.status,
          body: await response.text(),
        })
      }
      return response.ok
    }),
  )

  if (results.some((ok) => !ok)) {
    console.error('New LINE member notification failed for one or more admins')
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = headersFor(origin)

  if (req.method === 'OPTIONS') {
    if (!corsHeaders['Access-Control-Allow-Origin']) return new Response('Forbidden', { status: 403 })
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405, corsHeaders)
  if (!corsHeaders['Access-Control-Allow-Origin']) return json({ error: 'Origin not allowed' }, 403, corsHeaders)

  const lineChannelId = Deno.env.get('LINE_LOGIN_CHANNEL_ID')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!lineChannelId || !supabaseUrl || !serviceRoleKey) {
    return json({ error: 'LINE Login ยังตั้งค่าไม่ครบใน Supabase' }, 500, corsHeaders)
  }

  let idToken: string
  try {
    const body = await req.json()
    idToken = typeof body?.idToken === 'string' ? body.idToken : ''
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, corsHeaders)
  }
  if (!idToken) return json({ error: 'ไม่พบ LINE ID token' }, 400, corsHeaders)

  let identity: { sub?: string; name?: string; aud?: string }
  try {
    const verification = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: lineChannelId }),
    })
    if (!verification.ok) {
      const errorBody = await verification.json().catch(() => null)
      const errorCode = typeof errorBody?.error === 'string' ? errorBody.error : 'unknown'
      const errorDescription =
        typeof errorBody?.error_description === 'string' ? errorBody.error_description : 'unknown'
      console.error('LINE ID token verification rejected', {
        status: verification.status,
        error: errorCode,
        description: errorDescription,
      })
      const tokenExpired = /expired/i.test(errorDescription)
      return json(
        {
          error: tokenExpired
            ? 'เซสชัน LINE หมดอายุแล้ว กรุณากด "เข้าสู่ระบบด้วย LINE" อีกครั้ง'
            : 'LINE ปฏิเสธ ID token กรุณาตรวจว่า LINE_LOGIN_CHANNEL_ID ตรงกับ Channel ID ของ LIFF และเปิด scope openid แล้วเริ่ม Login ใหม่',
        },
        401,
        corsHeaders,
      )
    }
    identity = await verification.json()
  } catch {
    return json({ error: 'ติดต่อบริการยืนยันตัวตน LINE ไม่สำเร็จ' }, 502, corsHeaders)
  }

  if (!identity.sub || identity.aud !== lineChannelId) {
    return json({ error: 'ข้อมูลบัญชี LINE ไม่ถูกต้อง' }, 401, corsHeaders)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('id, full_name, position, department, role, approval_status, auth_user_id')
    .eq('line_user_id', identity.sub)
    .maybeSingle()

  if (profileError) return json({ error: 'ค้นหาข้อมูลบัญชีไม่สำเร็จ' }, 500, corsHeaders)

  let isNewProfile = false
  if (!profile) {
    const { data: createdProfile, error: createProfileError } = await admin
      .from('user_profiles')
      .insert({
        full_name: identity.name || 'ผู้ใช้ LINE',
        position: 'รอระบุตำแหน่ง',
        department: 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
        role: 'requester',
        line_user_id: identity.sub,
        approval_status: 'approved',
      })
      .select('id, full_name, position, department, role, approval_status, auth_user_id')
      .single()

    if (createProfileError) {
      const { data: existingProfile, error: retryError } = await admin
        .from('user_profiles')
        .select('id, full_name, position, department, role, approval_status, auth_user_id')
        .eq('line_user_id', identity.sub)
        .maybeSingle()
      if (retryError || !existingProfile) {
        return json({ error: 'สร้างโปรไฟล์ผู้ใช้ไม่สำเร็จ' }, 500, corsHeaders)
      }
      profile = existingProfile
    } else {
      profile = createdProfile
      isNewProfile = true
    }
  }

  const needsApprovalUpgrade = profile.role === 'requester' && profile.approval_status === 'pending'
  if (needsApprovalUpgrade) {
    const { error: approvalError } = await admin
      .from('user_profiles')
      .update({ approval_status: 'approved' })
      .eq('id', profile.id)
    if (approvalError) return json({ error: 'เปิดใช้งานบัญชีผู้ขอใช้รถไม่สำเร็จ' }, 500, corsHeaders)
    profile.approval_status = 'approved'
  }

  const needsAuthLink = !profile.auth_user_id
  let email = `line-${await hash(identity.sub)}@example.com`
  if (profile.auth_user_id) {
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(profile.auth_user_id)
    if (authUserError || !authUser.user?.email) {
      return json({ error: 'ไม่พบข้อมูลบัญชีระบบสำหรับผู้ใช้ LINE นี้' }, 500, corsHeaders)
    }
    email = authUser.user.email
  } else {
    const passwordBytes = crypto.getRandomValues(new Uint8Array(32))
    const password = Array.from(passwordBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { auth_provider: 'line', line_user_id: identity.sub },
    })

    let authUser = createdUser.user
    const isNewAuthUser = Boolean(authUser)
    if (!authUser && createUserError) {
      for (let page = 1; page <= 20 && !authUser; page += 1) {
        const { data: listedUsers, error: listError } = await admin.auth.admin.listUsers({
          page,
          perPage: 500,
        })
        if (listError) return json({ error: 'ตรวจสอบบัญชี LINE ที่มีอยู่ไม่สำเร็จ' }, 500, corsHeaders)
        authUser = listedUsers.users.find((user) => user.email === email) || null
        if (listedUsers.users.length < 500) break
      }
    }
    if (!authUser) return json({ error: 'สร้างบัญชีเข้าสู่ระบบไม่สำเร็จ' }, 500, corsHeaders)

    const { error: linkProfileError } = await admin
      .from('user_profiles')
      .update({ auth_user_id: authUser.id })
      .eq('id', profile.id)
      .is('auth_user_id', null)

    if (linkProfileError) {
      if (isNewAuthUser) await admin.auth.admin.deleteUser(authUser.id)
      return json({ error: 'ผูกบัญชี LINE กับโปรไฟล์ไม่สำเร็จ' }, 500, corsHeaders)
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  const hashedToken = link?.properties?.hashed_token
  if (linkError || !hashedToken) {
    return json({ error: 'สร้างเซสชันสำหรับเข้าสู่ระบบไม่สำเร็จ' }, 500, corsHeaders)
  }

  if (isNewProfile || needsAuthLink) {
    try {
      await notifyAdminsOfNewMember({
        full_name: profile.full_name || identity.name || 'ผู้ใช้ LINE',
        position: profile.position || 'ไม่ระบุตำแหน่ง',
        department: profile.department || 'ไม่ระบุสังกัด',
      })
    } catch (error) {
      console.error('New LINE member notification request failed', error)
    }
  }

  return json(
    {
      email,
      hashedToken,
      approvalStatus: profile.approval_status || 'pending',
    },
    200,
    corsHeaders,
  )
})
