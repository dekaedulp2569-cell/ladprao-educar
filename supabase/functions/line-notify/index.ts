import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  STATUS_LABEL,
  carTypeLabel,
  corsHeaders,
  formatThaiDateTimeRange,
  isValidLineId,
  json,
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

function statusFlex(request: CarRequestPayload, statusLabel: string, assignment?: {
  carLabel?: string
  driverName?: string
  driverPhone?: string
}) {
  const statusColorHex = statusColor(request.status)
  const statusEmojiChar = statusEmoji(request.status)
  
  const rows: Record<string, unknown>[] = [
    { type: 'text', text: `เลขที่เอกสาร: ${request.doc_number || '-'}`, size: 'xs', color: '#6B7280', wrap: true },
    { type: 'text', text: `ผู้ขอ: ${request.requester_name || '-'}`, size: 'sm', weight: 'bold', wrap: true },
    { type: 'text', text: `จุดรับ: ${request.pickup_location || '-'}`, size: 'sm', wrap: true },
    { type: 'text', text: `วัตถุประสงค์: ${request.purpose || '-'}`, size: 'sm', wrap: true },
    { type: 'text', text: `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`, size: 'sm', wrap: true },
    { type: 'text', text: `วันเวลา: ${formatThaiDateTimeRange(request.start_datetime, request.end_datetime)}`, size: 'sm', wrap: true },
    { type: 'text', text: `ผู้อนุมัติ: ${request.approval_type === 'district_director' ? 'ผู้อำนวยการเขต' : 'หัวหน้าฝ่ายการศึกษา'}`, size: 'xs', color: '#4B5563', wrap: true },
    {
      type: 'text',
      text: `สถานะ: ${statusEmojiChar} ${statusLabel}`,
      size: 'sm',
      weight: 'bold',
      color: statusColorHex,
      wrap: true,
    },
  ]

  if (assignment) {
    rows.push(
      { type: 'separator', margin: 'sm' },
      { type: 'text', text: `รถที่จัดสรร: ${assignment.carLabel || 'ไม่ระบุรถ'}`, size: 'sm', weight: 'bold', color: '#D97706', wrap: true },
      { type: 'text', text: `คนขับ: ${assignment.driverName || 'ยังไม่ระบุคนขับ'}${assignment.driverPhone ? ` (${assignment.driverPhone})` : ''}`, size: 'sm', wrap: true },
    )
  }

  return {
    type: 'bubble',
    styles: {
      header: {
        backgroundColor: statusColorHex,
      },
    },
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
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: rows },
  }
}

function driverFlex(request: CarRequestPayload, carLabel: string, driverName: string) {
  return {
    type: 'bubble',
    styles: { header: { backgroundColor: '#059669' } },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'EduLP Car • ใบสั่งงานปฏิบัติหน้าที่', color: '#D1FAE5', size: 'xs', weight: 'bold' },
        { type: 'text', text: '✅ อนุมัติแล้ว - ใบสั่งงานขับรถ', color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `🗓️ กำหนดการ: ${formatThaiDateTimeRange(request.start_datetime, request.end_datetime)}`, size: 'sm', weight: 'bold', wrap: true },
        { type: 'text', text: `🚘 รถที่ใช้: ${carLabel}`, size: 'sm', color: '#059669', weight: 'bold', wrap: true },
        { type: 'separator', margin: 'xs' },
        { type: 'text', text: `📍 จุดรับ (ต้นทาง): ${request.pickup_location || '-'}`, size: 'xs', color: '#4B5563', wrap: true },
        { type: 'text', text: `🏁 ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`, size: 'xs', color: '#4B5563', wrap: true },
        { type: 'text', text: `👤 ผู้ประสานงานหน้างาน: ${request.passenger_name || '-'}`, size: 'xs', color: '#1F2937', weight: 'bold', wrap: true },
        { type: 'text', text: `📞 เบอร์โทรศัพท์: ${request.passenger_phone || '-'}`, size: 'sm', color: '#2563EB', weight: 'bold', wrap: true },
        { type: 'text', text: `พนักงานขับรถ: ${driverName}`, size: 'sm', color: '#4B5563', wrap: true },
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
    if (request.status !== 'approved') {
      return json({ error: 'Driver instructions can only be sent for approved requests' }, 409)
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
      'ใบสั่งงานพนักงานขับรถ',
      driverFlex(requestData, carLabel, driver ? (driver.nickname ? `${driver.nickname} - ${driver.full_name}` : driver.full_name) : request.external_driver_name || 'พนักงานขับรถ'),
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
    // 🟡 ส่งเฉพาะ LINE ส่วนตัว Admin เท่านั้น (ห้ามส่งเข้ากลุ่ม LINE)
    const targets = new Map<string, string>()
    const missingRecipients: string[] = []

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

    addRelatedRecipients(request, targets, missingRecipients)
    const notifications = await Promise.all(
      [...targets].map(async ([recipient, target]) => ({
        target,
        result: await pushFlex(
          recipient,
          target === 'ผู้ขอ' ? 'รับคำขอใช้รถเรียบร้อยแล้ว' : 'มีรายการขอใช้รถราชการใหม่',
          statusFlex(requestData, statusLabel),
        ),
      })),
    )
    const ok =
      missingRecipients.length === 0 &&
      notifications.length > 0 &&
      notifications.every(({ result }) => result.ok)
    return json({ ok, notifications, missingRecipients })
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

  const notifications = await Promise.all(
    [...targets].map(async ([recipient, target]) => ({
      target,
      result: await pushFlex(
        recipient,
        request.status === 'approved' ? 'คำขอใช้รถได้รับการอนุมัติแล้ว' : 'อัปเดตสถานะคำขอใช้รถ',
        statusFlex(requestData, statusLabel, assignment),
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
