import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  STATUS_LABEL,
  corsHeaders,
  formatThaiDateTimeRange,
  groupId,
  isValidLineId,
  json,
  pushFlex,
  type CarRequestPayload,
} from '../_shared/line.ts'

type Payload = {
  type?: 'status' | 'driver_assigned' | 'request_reminder'
  request?: { id?: string }
}

function statusFlex(request: CarRequestPayload, statusLabel: string, assignment?: {
  carLabel?: string
  driverName?: string
  driverPhone?: string
}) {
  const rows: Record<string, unknown>[] = [
    { type: 'text', text: `เลขที่เอกสาร: ${request.doc_number || '-'}`, size: 'xs', color: '#6B7280', wrap: true },
    { type: 'text', text: `ผู้ขอ: ${request.requester_name || '-'}`, size: 'sm', weight: 'bold', wrap: true },
    { type: 'text', text: `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`, size: 'sm', wrap: true },
    { type: 'text', text: `วันเวลา: ${formatThaiDateTimeRange(request.start_datetime, request.end_datetime)}`, size: 'sm', wrap: true },
    { type: 'text', text: `ผู้อนุมัติ: ${request.approval_type === 'district_director' ? 'ผู้อำนวยการเขต' : 'หัวหน้าฝ่ายการศึกษา'}`, size: 'xs', color: '#4B5563', wrap: true },
    { type: 'text', text: `สถานะ: ${statusLabel}`, size: 'sm', weight: 'bold', color: '#D97706', wrap: true },
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
        backgroundColor:
          request.status === 'cancelled'
            ? '#B91C1C'
            : request.status === 'approved'
              ? '#B45309'
              : '#F59E0B',
      },
    },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'EduLP Car • อัปเดตสถานะ', color: '#FEF3C7', size: 'xs', weight: 'bold' },
        { type: 'text', text: statusLabel, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: rows },
  }
}

function driverFlex(request: CarRequestPayload, carLabel: string, driverName: string) {
  return {
    type: 'bubble',
    styles: { header: { backgroundColor: '#D97706' } },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: 'EduLP Car • ใบสั่งงาน', color: '#FEF3C7', size: 'xs', weight: 'bold' },
        { type: 'text', text: 'คุณมีคิววิ่งรถใหม่', color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: {
      type: 'box',
      layout: 'vertical',
      spacing: 'sm',
      contents: [
        { type: 'text', text: `วันเวลา: ${formatThaiDateTimeRange(request.start_datetime, request.end_datetime)}`, size: 'sm', weight: 'bold', wrap: true },
        { type: 'text', text: `รถ: ${carLabel}`, size: 'sm', wrap: true },
        { type: 'text', text: `ปลายทาง: ${request.destination || '-'} (${request.destination_province || '-'})`, size: 'sm', wrap: true },
        { type: 'text', text: `ผู้ติดต่อ: ${request.requester_name || '-'}${request.phone ? ` (${request.phone})` : ''}`, size: 'sm', color: '#2563EB', weight: 'bold', wrap: true },
        { type: 'text', text: `พนักงานขับรถ: ${driverName}`, size: 'xs', color: '#4B5563', wrap: true },
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
            .from('drivers')
            .select('full_name, phone, dept, line_user_id')
            .eq('id', request.assigned_driver_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      request.assigned_car_id
        ? admin.from('cars').select('license_plate, car_type').eq('id', request.assigned_car_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (driverError || carError) return json({ error: 'Unable to load assignment details' }, 500)
    if (request.assigned_driver_id && !driver) return json({ error: 'Assigned driver not found' }, 404)

    const carLabel = request.external_car_info ||
      (car ? `${car.license_plate} (${car.car_type || 'รถ'})` : 'ไม่ระบุรถ')
    const requestData = request as CarRequestPayload
    const destination =
      driver?.dept === 'education' && driver?.line_user_id && isValidLineId(driver.line_user_id)
        ? driver.line_user_id
        : groupId()

    if (!destination) {
      return json({
        ok: false,
        error: `คนขับรถ (${driver?.full_name || request.external_driver_name || 'คนขับ'}) ยังไม่ได้เชื่อม LINE และยังไม่ได้ตั้งค่ากลุ่ม LINE (วิธีเชื่อม: ให้คนขับเปิดเว็บแล้วกด 'เข้าสู่ระบบด้วย LINE' หรือให้แอดมินนำ LINE User ID มากรอกในเมนูบุคลากร)`,
      }, 422)
    }
    const result = await pushFlex(
      destination,
      'ใบสั่งงานพนักงานขับรถ',
      driverFlex(requestData, carLabel, driver?.full_name || request.external_driver_name || 'พนักงานขับรถ'),
    )
    return json({ target: destination === groupId() ? 'group' : 'driver_private', result }, result.ok ? 200 : 502)
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
              .from('drivers')
              .select('full_name, phone, line_user_id')
              .eq('id', request.assigned_driver_id)
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
      return json({ error: 'Unable to load notification recipients' }, 500)
    }

    const targets = new Map<string, string>()
    const missingRecipients: string[] = []
    const lineGroupId = groupId()
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
      (car ? `${car.license_plate} (${car.car_type || 'รถ'})` : undefined)
    const assignment = carLabel || driver?.full_name || request.external_driver_name
      ? {
          carLabel,
          driverName: request.external_driver_name || driver?.full_name,
          driverPhone: driver?.phone,
        }
      : undefined
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
        admin
          .from('user_profiles')
          .select('line_user_id')
          .eq('auth_user_id', request.requester_auth_user_id)
          .maybeSingle(),
        request.assigned_driver_id
          ? admin
              .from('drivers')
              .select('full_name, phone, line_user_id')
              .eq('id', request.assigned_driver_id)
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
      (car ? `${car.license_plate} (${car.car_type || 'รถ'})` : 'ไม่ระบุรถ')
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
    const lineGroupId = groupId()
    if (lineGroupId) targets.set(lineGroupId, 'กลุ่มฝ่ายการศึกษา')
    else missingRecipients.push('กลุ่มฝ่ายการศึกษา (ยังไม่ได้เชื่อมกลุ่ม LINE: ดึงบอทเข้ากลุ่มแล้วนำ Group ID ที่ขึ้นต้นด้วย C มาใส่ใน LINE_GROUP_ID)')

    if (request.requester_auth_user_id) {
      const { data: requester, error: requesterError } = await admin
        .from('user_profiles')
        .select('line_user_id')
        .eq('auth_user_id', request.requester_auth_user_id)
        .maybeSingle()
      if (requesterError) return json({ error: 'Unable to load requester LINE profile' }, 500)
      if (requester?.line_user_id && isValidLineId(requester.line_user_id)) targets.set(requester.line_user_id, 'ผู้ขอ')
      else missingRecipients.push('ผู้ขอใช้รถ (ยังไม่ได้เชื่อม LINE: ให้ผู้ขอเปิดเว็บแล้วกด "เข้าสู่ระบบด้วย LINE")')
    } else {
      missingRecipients.push('ผู้ขอใช้รถ (ยังไม่ได้เชื่อม LINE: ให้ผู้ขอเปิดเว็บแล้วกด "เข้าสู่ระบบด้วย LINE")')
    }

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
    const targets = new Map<string, string>()
    const missingRecipients: string[] = []
    const lineGroupId = groupId()
    if (lineGroupId) targets.set(lineGroupId, 'กลุ่มฝ่ายการศึกษา')
    else missingRecipients.push('กลุ่มฝ่ายการศึกษา (ไม่ได้ตั้งค่า LINE_GROUP_ID)')

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
        ? admin.from('drivers').select('full_name, phone').eq('id', request.assigned_driver_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (carError || driverError) return json({ error: 'Unable to load assignment details' }, 500)
    assignment = {
      carLabel: request.external_car_info ||
        (car ? `${car.license_plate} (${car.car_type || 'รถ'})` : undefined),
      driverName: request.external_driver_name || driver?.full_name,
      driverPhone: driver?.phone,
    }
  }

  const result = await pushFlex(
    requester.line_user_id,
    request.status === 'approved' ? 'คำขอใช้รถได้รับการอนุมัติแล้ว' : 'อัปเดตสถานะคำขอใช้รถ',
    statusFlex(requestData, statusLabel, assignment),
  )
  return json({ target: 'requester_private', result }, result.ok ? 200 : 502)
})
