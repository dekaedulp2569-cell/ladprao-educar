// Supabase Edge Function: trip-reminders
// เรียกทุก 5 นาทีด้วย pg_cron เพื่อแจ้งเตือนก่อนเวลาเดินทาง
//   - 30 นาทีก่อนเริ่ม: แจ้งพนักงานขับรถ
//   - 10 นาทีก่อนเริ่ม: แจ้งพนักงานขับรถ และผู้ที่เกี่ยวข้อง
//
// ต้องตั้งค่า secrets:
//   LINE_CHANNEL_ACCESS_TOKEN, CRON_SECRET (แนะนำ)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (มีให้อัตโนมัติใน Edge Function)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  bannerRow,
  carTypeLabel,
  corsHeaders,
  formatThaiDateTimeRange,
  isValidLineId,
  json,
  labelValueRow,
  pushFlex,
} from '../_shared/line.ts'

const LOOK_AHEAD_MINUTES = 70

// 🔴 แจ้งซ้ำก่อนออกรถ: คนขับได้รับการแจ้งเตือนในรูปแบบ "ใบสั่งงาน" (ข้อมูลชุดเดียวกับตอนอนุมัติ)
// พร้อมแถบนับเวลาถอยหลังเน้นอยู่ด้านบน ระดับความละเอียดลดลงตามความใกล้ของเวลา
const REMINDER_META = {
  driver_60: {
    color: '#DC2626',
    kicker: 'EduLP Car • ใบสั่งงานปฏิบัติหน้าที่ (แจ้งซ้ำ)',
    title: '🚨 ใบสั่งงาน: อีก 1 ชั่วโมงถึงเวลาออกรถ',
    banner: '⏰ เหลือเวลา 60 นาที — โปรดเตรียมรถที่จุดรับให้พร้อม',
    alt: 'แจ้งเตือนคนขับ: อีก 1 ชั่วโมงถึงเวลาเดินทาง',
    variant: 'full',
  },
  driver_30: {
    color: '#DC2626',
    kicker: 'EduLP Car • ใบสั่งงานปฏิบัติหน้าที่ (แจ้งซ้ำ)',
    title: '🚨 ใบสั่งงาน: อีก 30 นาทีถึงเวลาออกรถ',
    banner: '⏰ เหลือเวลา 30 นาที — โปรดจอดรถที่จุดรับตามเวลานัดหมาย',
    alt: 'แจ้งเตือนคนขับ: อีก 30 นาทีถึงเวลาเดินทาง',
    variant: 'compact',
  },
  driver_10: {
    color: '#DC2626',
    kicker: 'EduLP Car • ใบสั่งงานปฏิบัติหน้าที่ (แจ้งซ้ำ)',
    title: '🚨 ใบสั่งงาน: อีก 10 นาทีรถพร้อมออก',
    banner: '⏰ เหลือเวลา 10 นาที — โปรดอยู่ที่จุดรับตามเวลา ปล่อยรถทันทีที่ผู้เดินทางมาครบ',
    alt: 'แจ้งเตือนคนขับ: อีก 10 นาทีถึงเวลาเดินทาง',
    variant: 'compact',
  },
  related_10: {
    color: '#DC2626',
    kicker: 'EduLP Car • แจ้งเตือนผู้เดินทาง',
    title: '🚨 อีก 10 นาที รถจะออกจากจุดรับ',
    banner: '⏰ เหลือเวลา 10 นาที — โปรดประจำที่จุดรับตามเวลา',
    alt: 'แจ้งเตือนผู้เกี่ยวข้อง: อีก 10 นาทีรถจะออกเดินทาง',
    variant: 'passenger',
  },
} as const

type ReminderType = keyof typeof REMINDER_META

function reminderFlex(
  job: Record<string, unknown>,
  type: ReminderType,
  carLabel: string,
  driverLabel: string,
  driverPhone?: string,
) {
  const meta = REMINDER_META[type]
  const req = job as import('../_shared/line.ts').CarRequestPayload
  const destination = `${req.destination || '-'}${
    req.destination_province ? ` (${req.destination_province})` : ''
  }`
  const when = formatThaiDateTimeRange(req.start_datetime, req.end_datetime)
  const pickup = req.pickup_location || '-'
  const coordinator = `${req.passenger_name || '-'}${req.passenger_phone ? ` (${req.passenger_phone})` : ''}`

  const rows: Record<string, unknown>[] = [bannerRow(meta.banner)]

  if (meta.variant === 'passenger') {
    // 🔴 แจ้งผู้ขอ/ผู้เดินทาง: เน้นจุดรับ + เวลาออกรถ
    rows.push(
      labelValueRow('จุดรับ', pickup, { valueWeight: 'bold' }),
      labelValueRow('เวลาออกรถ', when, { valueWeight: 'bold' }),
      labelValueRow('ปลายทาง', destination),
      labelValueRow('รถ', carLabel, { valueWeight: 'bold', valueColor: '#047857' }),
      labelValueRow('คนขับ', `${driverLabel}${driverPhone ? ` (${driverPhone})` : ''}`),
    )
  } else if (meta.variant === 'compact') {
    // 🔴 แจ้งซ้ำ 30/10 นาที: ย่อ เน้นจุดรับ + เวลา + ผู้ประสานงาน
    rows.push(
      labelValueRow('จุดรับ (ต้นทาง)', pickup, { valueWeight: 'bold' }),
      labelValueRow('วัน-เวลา', when, { valueWeight: 'bold' }),
      labelValueRow('ปลายทาง', destination),
      labelValueRow('รถยนต์', carLabel, { valueWeight: 'bold', valueColor: '#047857' }),
      labelValueRow('ผู้ประสานงาน', coordinator),
    )
  } else {
    // 🔴 แจ้งซ้ำ 60 นาที: ใบสั่งงานฉบับเต็ม เหมือนที่ส่งตอนอนุมัติ
    rows.push(
      labelValueRow('เลขที่เอกสาร', req.doc_number || '-'),
      labelValueRow('วัน-เวลา', when, { valueWeight: 'bold' }),
      labelValueRow('จุดรับ (ต้นทาง)', pickup),
      labelValueRow('ปลายทาง', destination),
      labelValueRow('วัตถุประสงค์', req.purpose || '-'),
      labelValueRow('ผู้ประสานงานหน้างาน', req.passenger_name || '-', { valueWeight: 'bold' }),
      labelValueRow('เบอร์ติดต่อ', req.passenger_phone || '-', {
        valueWeight: 'bold',
        valueColor: '#1D4ED8',
      }),
      { type: 'separator', margin: 'sm' },
      labelValueRow('รถยนต์', carLabel, { valueWeight: 'bold', valueColor: '#047857' }),
      labelValueRow('พนักงานขับรถ', driverLabel),
    )
  }

  return {
    type: 'bubble',
    styles: { header: { backgroundColor: meta.color } },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        { type: 'text', text: meta.kicker, color: '#FEE2E2', size: 'xs', weight: 'bold', wrap: true },
        { type: 'text', text: meta.title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: rows },
  }
}

async function sendOnce(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  type: ReminderType,
  lineUserId: string,
  contents: Record<string, unknown>,
) {
  const { data: logRow, error: logError } = await supabase
    .from('trip_reminder_log')
    .insert({
      request_id: jobId,
      reminder_type: type,
      line_user_id: lineUserId,
    })
    .select('id')
    .maybeSingle()

  if (logError) {
    // 23505 = แจ้งเตือนประเภทนี้ให้คนนี้ไปแล้ว
    if (logError.code === '23505') return { ok: true, skipped: true, duplicate: true }
    return { ok: false, error: logError.message }
  }

  const result = await pushFlex(lineUserId, REMINDER_META[type].alt, contents)

  if (!result.ok && logRow?.id) {
    // ส่งไม่สำเร็จ: ลบ log เพื่อให้รอบถัดไปลองใหม่
    await supabase.from('trip_reminder_log').delete().eq('id', logRow.id)
  }

  return result
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const cronSecret = Deno.env.get('CRON_SECRET')
  const isCronRequest = Boolean(cronSecret && req.headers.get('x-cron-secret') === cronSecret)

  if (!isCronRequest) {
    const accessToken = req.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1]
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!accessToken || !supabaseUrl || !serviceRoleKey) {
      return json({ error: 'Unauthorized' }, 401)
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
    if (profile?.role !== 'admin' || profile.approval_status !== 'approved') {
      return json({ error: 'Admin access is required' }, 403)
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const now = new Date()
  const horizon = new Date(now.getTime() + LOOK_AHEAD_MINUTES * 60 * 1000)

  const { data: jobs, error } = await supabase
    .from('car_requests')
    .select('*')
    .eq('status', 'approved')
    .gte('start_datetime', now.toISOString())
    .lte('start_datetime', horizon.toISOString())
    .order('start_datetime', { ascending: true })

  if (error) return json({ error: error.message }, 500)

  const [{ data: cars, error: carsError }, { data: drivers, error: driversError }] =
    await Promise.all([
      supabase.from('cars').select('*'),
      supabase.from('user_profiles').select('*').eq('role', 'driver'),
    ])
  if (carsError || driversError) {
    return json({ error: 'Unable to load vehicle and driver details' }, 500)
  }

  const carById = new Map((cars || []).map((car) => [car.id, car]))
  const driverById = new Map((drivers || []).map((driver) => [driver.id, driver]))

  const results: unknown[] = []

  for (const job of jobs || []) {
    const start = new Date(job.start_datetime).getTime()
    const minutesUntil = (start - now.getTime()) / 60000
    if (minutesUntil <= 0) continue

    const driver = job.assigned_driver_id ? driverById.get(job.assigned_driver_id) : null
    const car = job.assigned_car_id ? carById.get(job.assigned_car_id) : null
    const carLabel = car
      ? `${car.license_plate} (${carTypeLabel(car.car_type)})`
      : job.external_car_info || 'ไม่ระบุรถ'
    const driverLabel = driver?.full_name || job.external_driver_name || 'ยังไม่ระบุคนขับ'
    const driverLineId = isValidLineId(driver?.line_user_id) ? driver!.line_user_id : ''

    if (minutesUntil <= 60 && driverLineId) {
      results.push({
        request: job.id,
        type: 'driver_60',
        result: await sendOnce(
          supabase,
          job.id,
          'driver_60',
          driverLineId,
          reminderFlex(job, 'driver_60', carLabel, driverLabel, driver?.phone),
        ),
      })
    }

    if (minutesUntil <= 30 && driverLineId) {
      results.push({
        request: job.id,
        type: 'driver_30',
        result: await sendOnce(
          supabase,
          job.id,
          'driver_30',
          driverLineId,
          reminderFlex(job, 'driver_30', carLabel, driverLabel, driver?.phone),
        ),
      })
    }

    if (minutesUntil <= 10) {
      if (driverLineId) {
        results.push({
          request: job.id,
          type: 'driver_10',
          result: await sendOnce(
            supabase,
            job.id,
            'driver_10',
            driverLineId,
            reminderFlex(job, 'driver_10', carLabel, driverLabel, driver?.phone),
          ),
        })
      }

      const relatedIds = Array.isArray(job.related_line_user_ids)
        ? job.related_line_user_ids
        : []
      for (const rawId of relatedIds) {
        if (typeof rawId !== 'string') continue
        const relatedId = rawId.trim()
        if (!isValidLineId(relatedId) || relatedId === driverLineId) continue
        results.push({
          request: job.id,
          type: 'related_10',
          result: await sendOnce(
            supabase,
            job.id,
            'related_10',
            relatedId,
            reminderFlex(job, 'related_10', carLabel, driverLabel, driver?.phone),
          ),
        })
      }
    }
  }

  return json({
    checkedAt: now.toISOString(),
    jobs: jobs?.length || 0,
    reminders: results.length,
    results,
  })
})
