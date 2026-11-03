import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
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
  type?: 'status' | 'driver_assigned'
  request?: { id?: string }
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

  const isStaff = profile.role === 'admin' || profile.role === 'head_of_dept'
  if (payload.type === 'driver_assigned') {
    if (!isStaff) return json({ error: 'Staff access is required' }, 403)
    if (!request.assigned_driver_id) return json({ error: 'No driver is assigned' }, 400)

    const [{ data: driver, error: driverError }, { data: car, error: carError }] = await Promise.all([
      admin
        .from('drivers')
        .select('full_name, dept, line_user_id')
        .eq('id', request.assigned_driver_id)
        .maybeSingle(),
      request.assigned_car_id
        ? admin.from('cars').select('license_plate, car_type').eq('id', request.assigned_car_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    if (driverError || carError) return json({ error: 'Unable to load assignment details' }, 500)
    if (!driver) return json({ error: 'Assigned driver not found' }, 404)

    const carLabel = request.external_car_info ||
      (car ? `${car.license_plate} (${car.car_type || 'รถ'})` : 'ไม่ระบุรถ')
    const message = buildDriverMessage(request as CarRequestPayload, carLabel)
    const destination =
      driver.dept === 'education' && driver.line_user_id ? driver.line_user_id : groupId()
    const result = await pushText(destination, message)
    return json({ target: destination === groupId() ? 'group' : 'driver_private', result }, result.ok ? 200 : 502)
  }

  if (!isStaff && request.requester_auth_user_id !== authData.user.id) {
    return json({ error: 'You cannot notify for this request' }, 403)
  }

  const statusLabel = STATUS_LABEL[String(request.status || '')] || 'อัปเดตสถานะ'
  const message = buildStatusMessage(request as CarRequestPayload, statusLabel)
  const result = await pushText(groupId(), message)
  return json({ target: 'group', result }, result.ok ? 200 : 502)
})
