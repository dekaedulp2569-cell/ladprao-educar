import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  STATUS_LABEL,
  bannerRow,
  carTypeLabel,
  corsHeaders,
  formatThaiDateTimeRange,
  isValidLineId,
  json,
  labelValueRow,
  pushFlex,
  resolveGroupId,
  statusColor,
  statusEmoji,
  type CarRequestPayload,
} from '../_shared/line.ts'

type Payload = {
  type?: 'status' | 'driver_assigned' | 'request_reminder'
  request?: { id?: string }
}

/** เพิ่ม LINE User ID ของผู้ที่เกี่ยวข้องในคำขอเข้า targets */
function addRelatedRecipients(
  request: { related_line_user_ids?: unknown },
  targets: Map<string, string>,
  missingRecipients: string[],
) {
  if (!Array.isArray(request.related_line_user_ids)) return
  for (const lineId of request.related_line_user_ids) {
    if (typeof lineId !== 'string' || !lineId.trim()) continue
    if (isValidLineId(lineId)) {
      if (!targets.has(lineId)) targets.set(lineId, 'ผู้เกี่ยวข้อง')
    } else {
      missingRecipients.push(`ผู้ที่เกี่ยวข้อง (${lineId}) ยังไม่ได้เชื่อม LINE`)
    }
  }
}

/** ชื่อผู้อนุมัติตามประเภทคำขอ */
function approverLabel(request: CarRequestPayload) {
  return request.approval_type === 'district_director' ? 'ผู้อำนวยการเขต' : 'หัวหน้าฝ่ายการศึกษา'
}

/** ปุ่มเปิดเว็บแอปในข้อความแจ้ง Admin (ต้องตั้งค่า env LINE_WEB_APP_URL เมื่อไม่ตั้งจะไม่แสดงปุ่ม) */
function webAppButton(label: string) {
  const base = Deno.env.get('LINE_WEB_APP_URL')?.trim().replace(/\/+$/, '')
  if (!base) return null
  return { label, uri: base }
}

type FlexAssignment = {
  carLabel?: string
  driverName?: string
  driverPhone?: string
}

type StatusFlexOptions = {
  banner?: { text: string; background?: string; color?: string }
  note?: string
  button?: { label: string; uri: string } | null
}

function statusFlex(
  request: CarRequestPayload,
  statusLabel: string,
  assignment?: FlexAssignment,
  opts?: StatusFlexOptions,
) {
  const statusColorHex = statusColor(request.status)
  const statusEmojiChar = statusEmoji(request.status)

  const rows: Record<string, unknown>[] = []

  // แถบเน้นด้านบน (เช่น แจ้งยกเลิก) — ช่องแรงสายตาก่อนเนื้อหา
  if (opts?.banner) {
    rows.push(
      bannerRow(opts.banner.text, { background: opts.banner.background, color: opts.banner.color }),
    )
  }

  // เนื้อหาแยกเป็น ป้ายกำกับ (ซ้าย ตัวหนา) + ค่า (ขวา ปกติ)
  rows.push(labelValueRow('เลขที่เอกสาร', request.doc_number || '-'))
  rows.push(labelValueRow('ผู้ขอ', request.requester_name || '-', { valueWeight: 'bold' }))
  const department = (request as Record<string, unknown>).requester_department
  if (department) {
    rows.push(labelValueRow('สังกัด', String(department)))
  }
  rows.push(labelValueRow('จุดรับ', request.pickup_location || '-'))
  rows.push(
    labelValueRow(
      'ปลายทาง',
      `${request.destination || '-'}${
        request.destination_province ? ` (${request.destination_province})` : ''
      }`,
    ),
  )
  rows.push(labelValueRow('วัตถุประสงค์', request.purpose || '-'))
  rows.push(
    labelValueRow('วัน-เวลา', formatThaiDateTimeRange(request.start_datetime, request.end_datetime), {
      valueWeight: 'bold',
    }),
  )
  rows.push(labelValueRow('ผู้อนุมัติ', approverLabel(request)))

  if (assignment) {
    rows.push(
      { type: 'separator', margin: 'sm' },
      labelValueRow('รถที่จัดสรร', assignment.carLabel || 'ไม่ระบุรถ', {
        valueWeight: 'bold',
        valueColor: '#047857',
      }),
      labelValueRow(
        'คนขับ',
        `${assignment.driverName || 'ยังไม่ระบุคนขับ'}${
          assignment.driverPhone ? ` (${assignment.driverPhone})` : ''
        }`,
      ),
    )
  }

  // โน้ตแนะสำหรับผู้ขอ/ผู้เดินทาง (ธีมเขียวอ่อน)
  if (opts?.note) {
    rows.push(bannerRow(opts.note, { background: '#D1FAE5', color: '#047857' }))
  }

  rows.push(
    labelValueRow('สถานะ', `${statusEmojiChar} ${statusLabel}`, {
      valueWeight: 'bold',
      valueColor: statusColorHex,
    }),
  )

  const footer = opts?.button
    ? {
        type: 'box',
        layout: 'vertical',
        paddingAll: '10px',
        paddingTop: '0px',
        contents: [
          {
            type: 'button',
            action: { type: 'uri', label: opts.button.label, uri: opts.button.uri },
            style: 'primary',
            color: statusColorHex,
          },
        ],
      }
    : undefined

  return {
    type: 'bubble',
    styles: { header: { backgroundColor: statusColorHex } },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'EduLP Car • อัปเดตสถานะ', color: '#FEF3C7', size: 'xs', weight: 'bold' },
        {
          type: 'text',
          text: `${statusEmojiChar} ${statusLabel}`,
          color: '#FFFFFF',
          size: 'md',
          weight: 'bold',
          wrap: true,
        },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: rows },
    ...(footer ? { footer } : {}),
  }
}

/**
 * ใบสั่งงานส่วนตัวคนขับตามสถานะ
 *  - approved    → 🟢 ใบสั่งงานฉบับทางการ (ล็อกคิว)
 *  - pending / tentative → 🟠 ใบสั่งงานล่วงหน้า (ยังไม่อนุมัติ ผูกพันน้อย อาจเปลี่ยนแปลง)
 */
function driverFlex(request: CarRequestPayload, carLabel: string, driverName: string, approved = true) {
  const statusText = `${statusEmoji(request.status)} ${
    STATUS_LABEL[String(request.status || '')] || 'อัปเดตสถานะ'
  }`

  const theme = approved
    ? {
        headerColor: '#059669',
        kickerColor: '#D1FAE5',
        title: '✅ ใบสั่งงานขับรถ — อนุมัติแล้ว (ล็อกคิว)',
        banner: bannerRow('🟢 อนุมัติเรียบร้อย — จัดสรรถือเป็นทางการ โปรดเตรียมรถที่จุดรับตามเวลา', {
          background: '#D1FAE5',
          color: '#065F46',
        }),
        carValueColor: '#047857',
        statusRow: labelValueRow('สถานะ', `${statusText} — โปรดปฏิบัติหน้าที่ตามเวลา`, {
          valueWeight: 'bold',
          valueColor: '#047857',
        }),
      }
    : {
        headerColor: '#D97706',
        kickerColor: '#FEF3C7',
        title:
          request.status === 'tentative'
            ? '🟠 ใบสั่งงานล่วงหน้า — รอ ผอ.เขต ลงนามอนุมัติ'
            : '🟠 ใบสั่งงานล่วงหน้า — รอตรวจสอบ/รออนุมัติ',
        banner: bannerRow(
          request.status === 'tentative'
            ? '🟠 ยังไม่ได้รับการอนุมัติ (รอ ผอ.เขต ลงนาม) — โปรดเตรียมตัวล่วงหน้า และรอข้อความอนุมัติ (สีเขียว) ก่อนออกรถจริง'
            : '🟠 ยังไม่ได้รับการอนุมัติ — จัดสรรล่วงหน้าเท่านั้น อาจมีการเปลี่ยนแปลง โปรดเตรียมตัวล่วงหน้าและรอข้อความอนุมัติ (สีเขียว) ก่อนออกรถจริง',
          { background: '#FFEDD5', color: '#9A3412' },
        ),
        carValueColor: '#B45309',
        statusRow: labelValueRow('สถานะ', `${statusText} — อาจมีการเปลี่ยนแปลง`, {
          valueWeight: 'bold',
          valueColor: '#B45309',
        }),
      }

  return {
    type: 'bubble',
    styles: { header: { backgroundColor: theme.headerColor } },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'EduLP Car • ใบสั่งงานปฏิบัติหน้าที่', color: theme.kickerColor, size: 'xs', weight: 'bold' },
        { type: 'text', text: theme.title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'xs',
      contents: [
        theme.banner,
        labelValueRow('เลขที่เอกสาร', request.doc_number || '-'),
        labelValueRow('วัน-เวลา', formatThaiDateTimeRange(request.start_datetime, request.end_datetime), {
          valueWeight: 'bold',
        }),
        labelValueRow('จุดรับ (ต้นทาง)', request.pickup_location || '-'),
        labelValueRow(
          'ปลายทาง',
          `${request.destination || '-'}${
            request.destination_province ? ` (${request.destination_province})` : ''
          }`,
        ),
        labelValueRow('วัตถุประสงค์', request.purpose || '-'),
        labelValueRow('ผู้ประสานงานหน้างาน', request.passenger_name || '-', { valueWeight: 'bold' }),
        labelValueRow('เบอร์ติดต่อ', request.passenger_phone || '-', {
          valueWeight: 'bold',
          valueColor: '#1D4ED8',
        }),
        { type: 'separator', margin: 'sm' },
        labelValueRow('รถยนต์', carLabel, { valueWeight: 'bold', valueColor: theme.carValueColor }),
        labelValueRow('พนักงานขับรถ', driverName),
        theme.statusRow,
      ],
    },
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = req.headers.get('authorization')
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]
  if (!accessToken) return json({ error: 'Unauthorized' }, 401)

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'LINE notification is not configured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken)
  if (authError || !authData.user) return json({ error: 'Unauthorized' }, 401)

  const { data: profile, error: profileError } = await admin
    .from('user_profiles')
    .select('role, approval_status')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle()
  if (profileError) return json({ error: 'Unable to verify user permissions' }, 500)
  if (!profile || profile.approval_status !== 'approved') {
    return json({ error: 'An approved account is required' }, 403)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }
  if (!payload.request?.id) return json({ error: 'Request ID is required' }, 400)

  const { data: request, error: requestError } = await admin
    .from('car_requests')
    .select('*')
    .eq('id', payload.request.id)
    .maybeSingle()
  if (requestError) return json({ error: 'Unable to load request' }, 500)
  if (!request) return json({ error: 'Request not found' }, 404)

  // กลุ่มเริ่มต้นจัดการได้จากหน้าเว็บ (line_groups) และมี LINE_GROUP_ID เป็นตัวสำรอง
  const lineGroupId = await resolveGroupId(admin)

  if (payload.type === 'driver_assigned') {
    if (profile.role !== 'admin') return json({ error: 'Admin access is required' }, 403)
    // 🟠 จัดสรรล่วงหน้าได้ตั้งแต่สถานะ pending/tentative (ใบสั่งงานโทนส้ม) / 🟢 เมื่อ approved ใบสั่งงานโทนเขียว
    const isApproved = request.status === 'approved'
    if (!isApproved && request.status !== 'pending' && request.status !== 'tentative') {
      return json(
        { error: 'Driver instructions can only be sent for pending, tentative, or approved requests' },
        409,
      )
    }
    if (!request.assigned_driver_id && !request.external_driver_name) {
      return json({ error: 'No driver is assigned' }, 400)
    }

    const [{ data: driver, error: driverError }, { data: car, error: carError }] = await Promise.all([
      request.assigned_driver_id
        ? admin
            .from('user_profiles').select('full_name, nickname, phone, line_user_id, driver_dept_type')
            .eq('id', request.assigned_driver_id)
            .eq('role', 'driver')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      request.assigned_car_id
        ? admin.from('cars').select('license_plate, car_type').eq('id', request.assigned_car_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (driverError || carError) return json({ error: 'Unable to load assignment details' }, 500)
    if (request.assigned_driver_id && !driver) return json({ error: 'Assigned driver not found' }, 404)

    const carLabel = request.external_car_info ||
      (car ? `${car.license_plate} (${carTypeLabel(car.car_type)})` : 'ไม่ระบุรถ')
    const requestData = request as CarRequestPayload

    // ส่งใบสั่งงานเฉพาะพนักงานขับรถคนนั้นเท่านั้น (ไม่ส่งเข้ากลุ่ม)
    const driverLineId = driver?.line_user_id && isValidLineId(driver.line_user_id)
      ? driver.line_user_id
      : (request.external_driver_name ? '' : '')

    if (!driverLineId) {
      return json({
        ok: false,
        error: `คนขับรถ (${driver?.full_name || request.external_driver_name || 'คนขับ'}) ยังไม่ได้เชื่อม LINE กรุณาให้คนขับเปิดเว็บแล้วกด 'เข้าสู่ระบบด้วย LINE' หรือให้แอดมินนำ LINE User ID มากรอกในเมนูบุคลากร`,
      }, 422)
    }
    const result = await pushFlex(
      driverLineId,
      isApproved ? 'ใบสั่งงานพนักงานขับรถ' : 'ใบสั่งงานล่วงหน้า (ยังไม่อนุมัติ)',
      driverFlex(
        requestData,
        carLabel,
        driver ? (driver.nickname ? `${driver.nickname} - ${driver.full_name}` : driver.full_name) : request.external_driver_name || 'พนักงานขับรถ',
        isApproved,
      ),
    )
    return json({ target: 'driver_private', result }, result.ok ? 200 : 502)
  }

  const canManageRequest =
    profile.role === 'admin' ||
    (profile.role === 'head_of_dept' && request.approval_type === 'head_of_dept')

  if (payload.type === 'request_reminder') {
    if (profile.role !== 'admin') return json({ error: 'Admin access is required' }, 403)

    const [{ data: requester, error: requesterError }, { data: driver, error: driverError }, { data: car, error: carError }] =
      await Promise.all([
        request.requester_auth_user_id
          ? admin
              .from('user_profiles')
              .select('line_user_id')
              .eq('auth_user_id', request.requester_auth_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        request.assigned_driver_id
          ? admin
              .from('user_profiles').select('full_name, nickname, phone, line_user_id, driver_dept_type')
              .eq('id', request.assigned_driver_id)
              .eq('role', 'driver')
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        request.assigned_car_id
          ? admin
              .from('cars')
              .select('license_plate, car_type')
              .eq('id', request.assigned_car_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
    if (requesterError || driverError || carError) {
      console.error('Recipients error:', { requesterError, driverError, carError })
      const detail = requesterError?.message || driverError?.message || carError?.message || 'ไม่ทราบสาเหตุ'
      return json({ error: `ไม่สามารถโหลดข้อมูลผู้รับแจ้งเตือน: ${detail}` }, 500)
    }

    const targets = new Map<string, string>()
    const missingRecipients: string[] = []
    if (lineGroupId) {
      targets.set(lineGroupId, 'กลุ่มฝ่ายการศึกษา')
    } else {
      missingRecipients.push('กลุ่มฝ่ายการศึกษา (ยังไม่ได้เชื่อมกลุ่ม LINE: ดึงบอทเข้ากลุ่มแล้วนำ Group ID ที่ขึ้นต้นด้วย C มาใส่ใน LINE_GROUP_ID)')
    }

    if (requester?.line_user_id && isValidLineId(requester.line_user_id)) {
      targets.set(requester.line_user_id, 'ผู้ขอ')
    } else {
      missingRecipients.push('ผู้ขอใช้รถ (ยังไม่ได้เชื่อม LINE: ให้ผู้ขอเปิดเว็บแล้วกด "เข้าสู่ระบบด้วย LINE")')
    }

    if (driver?.line_user_id && isValidLineId(driver.line_user_id)) {
      targets.set(driver.line_user_id, 'พนักงานขับรถ')
    } else if (request.assigned_driver_id || request.external_driver_name) {
      const dName = driver?.full_name || request.external_driver_name || 'คนขับ'
      missingRecipients.push(`คนขับรถ ${dName} (ยังไม่ได้เชื่อม LINE: ให้คนขับเปิดเว็บกด "เข้าสู่ระบบด้วย LINE" หรือแอดมินนำ LINE User ID มากรอกในแท็บบุคลากร)`)
    }

    const carLabel = request.external_car_info ||
      (car ? `${car.license_plate} (${carTypeLabel(car.car_type)})` : undefined)
    const assignment = carLabel || driver?.full_name || request.external_driver_name
      ? {
          carLabel,
          driverName: request.external_driver_name || driver?.full_name,
          driverPhone: driver?.phone,
        }
      : undefined
    addRelatedRecipients(request, targets, missingRecipients)
    const reminder = statusFlex(
      request as CarRequestPayload,
      `${STATUS_LABEL[String(request.status || '')] || 'อัปเดตสถานะ'} • แจ้งซ้ำ`,
      assignment,
    )
    const notifications = await Promise.all(
      [...targets].map(async ([recipient, target]) => ({
        target,
        result: await pushFlex(recipient, 'แจ้งเตือนคำขอใช้รถ', reminder),
      })),
    )
    const allFailed = targets.size === 0 || (notifications.length > 0 && notifications.every(({ result }) => !result.ok))
    return json({
      ok: !allFailed,
      notifications,
      missingRecipients,
      error: allFailed
        ? `ยังไม่มีผู้รับที่เชื่อมต่อ LINE:\n• ${missingRecipients.join('\n• ')}`
        : undefined,
    }, allFailed ? 422 : 200)
  }

    if (request.status === 'cancelled') {
    if (profile.role !== 'admin' && request.requester_auth_user_id !== authData.user.id) {
      return json({ error: 'Only the requester or an admin can notify this cancellation' }, 403)
    }

    const [{ data: requester, error: requesterError }, { data: driver, error: driverError }, { data: car, error: carError }] =
      await Promise.all([
        request.requester_auth_user_id
          ? admin
              .from('user_profiles')
              .select('line_user_id')
              .eq('auth_user_id', request.requester_auth_user_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        request.assigned_driver_id
          ? admin
              .from('user_profiles')
              .select('full_name, nickname, phone, line_user_id, driver_dept_type')
              .eq('id', request.assigned_driver_id)
              .eq('role', 'driver')
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        request.assigned_car_id
          ? admin.from('cars').select('license_plate, car_type').eq('id', request.assigned_car_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ])
    if (requesterError || driverError || carError) {
      return json({ error: 'Unable to load cancellation notification details' }, 500)
    }

    const carLabel = request.external_car_info ||
      (car ? `${car.license_plate} (${carTypeLabel(car.car_type)})` : 'ไม่ระบุรถ')
    const cancellationMessage = statusFlex(
      request as CarRequestPayload,
      'ยกเลิกคำขอใช้รถ',
      {
        carLabel,
        driverName: request.external_driver_name || driver?.full_name,
        driverPhone: driver?.phone,
      },
      {
        banner: { text: 'คำขอนี้ถูกยกเลิกแล้ว — โปรดเว้นคิวรถ/คนขับที่จัดไว้' },
      },
    )
    const targets = new Map<string, string>()
    const missingRecipients: string[] = []
    if (lineGroupId) targets.set(lineGroupId, 'กลุ่มฝ่ายการศึกษา')
    else missingRecipients.push('กลุ่มฝ่ายการศึกษา (ยังไม่ได้เชื่อมกลุ่ม LINE: ดึงบอทเข้ากลุ่มแล้วนำ Group ID ที่ขึ้นต้นด้วย C มาใส่ใน LINE_GROUP_ID)')

    if (requester?.line_user_id && isValidLineId(requester.line_user_id)) {
      targets.set(requester.line_user_id, 'ผู้ขอ')
    } else {
      missingRecipients.push('ผู้ขอใช้รถ (ยังไม่ได้เชื่อม LINE: ให้ผู้ขอเปิดเว็บแล้วกด "เข้าสู่ระบบด้วย LINE")')
    }

    // 📢 เพิ่มผู้รับ "พนักงานขับรถ" ให้ทราบทันทีว่างานถูกยกเลิก (ไม่ต้องเตรียมรถ)
    if (driver?.line_user_id && isValidLineId(driver.line_user_id)) {
      if (!targets.has(driver.line_user_id)) targets.set(driver.line_user_id, 'พนักงานขับรถ')
    } else if (request.assigned_driver_id || request.external_driver_name) {
      const dName = driver?.full_name || request.external_driver_name || 'คนขับ'
      missingRecipients.push(`คนขับรถ ${dName} (ยังไม่ได้เชื่อม LINE: ให้คนขับเปิดเว็บกด "เข้าสู่ระบบด้วย LINE" หรือแอดมินนำ LINE User ID มากรอกในแท็บบุคลากร)`)
    }

    addRelatedRecipients(request, targets, missingRecipients)
    const notifications = await Promise.all(
      [...targets].map(async ([recipient, label]) => ({
        target: label,
        result: await pushFlex(recipient, 'แจ้งยกเลิกคำขอใช้รถที่อนุมัติแล้ว', cancellationMessage),
      })),
    )
    const failed = missingRecipients.length > 0 || notifications.some(({ result }) => !result.ok)
    return json(
      { ok: !failed, notifications, missingRecipients },
      failed ? 502 : 200,
    )
  }

  if (!canManageRequest && request.requester_auth_user_id !== authData.user.id) {
    return json({ error: 'You cannot notify for this request' }, 403)
  }

  const statusLabel = STATUS_LABEL[String(request.status || '')] || 'อัปเดตสถานะ'
  const requestData = request as CarRequestPayload

  if (request.status === 'pending' || request.status === 'tentative') {
    // 🟡 ส่งเฉพาะ LINE ส่วนตัว (ผู้ขอ + Admin เท่านั้น — ห้ามส่งเข้ากลุ่ม LINE)
    const targets = new Map<string, string>()
    const missingRecipients: string[] = []
    const adminNotice: string[] = []

    if (request.requester_auth_user_id) {
      const { data: requester, error: requesterError } = await admin
        .from('user_profiles')
        .select('line_user_id')
        .eq('auth_user_id', request.requester_auth_user_id)
        .maybeSingle()
      if (requesterError) return json({ error: 'Unable to load requester LINE profile' }, 500)
      if (requester?.line_user_id) targets.set(requester.line_user_id, 'ผู้ขอ')
      else missingRecipients.push('ผู้ขอ (ไม่พบ LINE User ID)')
    } else {
      missingRecipients.push('ผู้ขอ (ไม่พบการเชื่อมบัญชี)')
    }

    // 🟡 แจ้งส่วนตัว Admin ที่เชื่อม LINE แล้ว (พร้อมปุ่มเปิดเว็บแอป)
    const { data: admins, error: adminsError } = await admin
      .from('user_profiles')
      .select('full_name, line_user_id')
      .eq('role', 'admin')
      .eq('approval_status', 'approved')
    if (adminsError) return json({ error: 'Unable to load admin LINE profiles' }, 500)
    for (const adminRow of admins || []) {
      if (adminRow.line_user_id && isValidLineId(adminRow.line_user_id)) {
        targets.set(adminRow.line_user_id, 'แอดมิน')
      } else {
        adminNotice.push(`แอดมิน ${adminRow.full_name || '(ไม่ระบุชื่อ)'} ยังไม่ได้เชื่อม LINE`)
      }
    }

    const adminButton = webAppButton(
      request.status === 'tentative'
        ? 'เปิดแอป • แนบใบลงนาม & อนุมัติ'
        : 'เปิดแอป • ตรวจสอบ & จัดสรรรถ',
    )
    addRelatedRecipients(request, targets, missingRecipients)
    const notifications = await Promise.all(
      [...targets].map(async ([recipient, target]) => ({
        target,
        result: await pushFlex(
          recipient,
          target === 'ผู้ขอ' ? 'รับคำขอใช้รถเรียบร้อยแล้ว' : 'มีรายการขอใช้รถราชการใหม่',
          statusFlex(requestData, statusLabel, undefined, {
            button: target === 'แอดมิน' ? adminButton : null,
          }),
        ),
      })),
    )
    const ok =
      missingRecipients.length === 0 &&
      notifications.length > 0 &&
      notifications.every(({ result }) => result.ok)
    return json({
      ok,
      notifications,
      missingRecipients,
      adminNotice: adminNotice.length ? adminNotice : undefined,
    })
  }

  const { data: requester, error: requesterError } = await admin
    .from('user_profiles')
    .select('line_user_id')
    .eq('auth_user_id', request.requester_auth_user_id)
    .maybeSingle()
  if (requesterError) return json({ error: 'Unable to load requester LINE profile' }, 500)
  if (!requester?.line_user_id || !isValidLineId(requester.line_user_id)) {
    return json({
      ok: false,
      error: 'ผู้ขอใช้รถยังไม่ได้เชื่อมต่อ LINE (วิธีเชื่อม: ให้ผู้ขอเปิดเว็บแล้วกด "เข้าสู่ระบบด้วย LINE")',
    }, 422)
  }

  let assignment: { carLabel?: string; driverName?: string; driverPhone?: string } | undefined
  if (request.status === 'approved') {
    const [{ data: car, error: carError }, { data: driver, error: driverError }] = await Promise.all([
      request.assigned_car_id
        ? admin.from('cars').select('license_plate, car_type').eq('id', request.assigned_car_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      request.assigned_driver_id
        ? admin
            .from('user_profiles')
            .select('full_name, nickname, phone, driver_dept_type')
            .eq('id', request.assigned_driver_id)
            .eq('role', 'driver')
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (carError || driverError) return json({ error: 'Unable to load assignment details' }, 500)
    assignment = {
      carLabel: request.external_car_info ||
        (car ? `${car.license_plate} (${carTypeLabel(car.car_type)})` : undefined),
      driverName: request.external_driver_name || driver?.full_name,
      driverPhone: driver?.phone,
    }
  }

  const targets = new Map<string, string>()
  if (lineGroupId) targets.set(lineGroupId, 'กลุ่มฝ่ายการศึกษา')
  targets.set(requester.line_user_id, 'ผู้ขอ')
  const missingRecipients: string[] = []
  addRelatedRecipients(request, targets, missingRecipients)

  const isApproved = request.status === 'approved'
  // 🟢 อนุมัติ: การ์ดกลุ่มเน้นประกาศภาพรวม / การ์ดผู้ขอเน้นแจ้งผล + มาที่จุดรับก่อนเวลา
  const groupCard = statusFlex(requestData, statusLabel, assignment)
  const requesterCard = statusFlex(requestData, statusLabel, assignment, isApproved ? {
    note: '🚶 ผู้เดินทางโปรดมายังจุดรับก่อนเวลาออกรถ 10 นาที',
  } : undefined)

  const notifications = await Promise.all(
    [...targets].map(async ([recipient, target]) => ({
      target,
      result: await pushFlex(
        recipient,
        isApproved
          ? target === 'กลุ่มฝ่ายการศึกษา'
            ? 'ประกาศ: อนุมัติและล็อกคิวใช้รถเรียบร้อย'
            : 'คำขอใช้รถได้รับการอนุมัติแล้ว'
          : 'อัปเดตสถานะคำขอใช้รถ',
        isApproved && target === 'กลุ่มฝ่ายการศึกษา' ? groupCard : requesterCard,
      ),
    })),
  )
  const failed = notifications.length === 0 || notifications.every(({ result }) => !result.ok)
  return json(
    {
      ok: !failed,
      target: 'requester_private',
      result: notifications[0]?.result,
      notifications,
      missingRecipients,
    },
    failed ? 502 : 200,
  )
})
