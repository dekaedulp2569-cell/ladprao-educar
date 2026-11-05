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
  buildMissionText,
  carTypeLabel,
  corsHeaders,
  isValidLineId,
  json,
  pushFlex,
} from '../_shared/line.ts'

const LOOK_AHEAD_MINUTES = 36

const REMINDER_META = {
  driver_30: {
    color: '#D97706',
    title: 'อีก 30 นาทีถึงเวลาเดินทาง',
    alt: 'แจ้งเตือนคนขับ: อีก 30 นาทีถึงเวลาเดินทาง',
  },
  driver_10: {
    color: '#DC2626',
    title: 'อีก 10 นาทีถึงเวลาเดินทาง',
    alt: 'แจ้งเตือนคนขับ: อีก 10 นาทีถึงเวลาเดินทาง',
  },
  related_10: {
    color: '#2563EB',
    title: 'อีก 10 นาทีรถจะออกเดินทาง',
    alt: 'แจ้งเตือนผู้เกี่ยวข้อง: อีก 10 นาทีรถจะออกเดินทาง',
  },
} as const

type ReminderType = keyof typeof REMINDER_META

function reminderFlex(
  job: Record<string, unknown>,
  type: ReminderType,
  carLabel: string,
  driverLabel: string,
) {
  const meta = REMINDER_META[type]
  const minutesLeft = type === 'driver_30' ? 30 : 10

  const missionText = buildMissionText({
    index: 1,
    request: job as import('../_shared/line.ts').CarRequestPayload,
    carLabel,
    driverLabel,
  })

  const rows: Record<string, unknown>[] = [
    {
      type: 'text',
      text: `เหลืออีกประมาณ ${minutesLeft} นาทีถึงเวลาเดินทาง`,
      size: 'md',
      weight: 'bold',
      color: meta.color,
      wrap: true,
    },
    {
      type: 'text',
      text: missionText,
      size: 'md',
      wrap: true,
    },
  ]

  return {
    type: 'bubble',
    styles: { header: { backgroundColor: meta.color } },
    header: {
      type: 'box',
      layout: 'vertical',
      contents: [
        {
          type: 'text',
          text: 'EduLP Car • แจ้งเตือนก่อนเดินทาง',
          color: '#FEF3C7',
          size: 'sm',
          weight: 'bold',
        },
        { type: 'text', text: meta.title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
      ],
    },
    body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: rows },
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
      supabase.from('drivers').select('*'),
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

    if (minutesUntil <= 30 && driverLineId) {
      results.push({
        request: job.id,
        type: 'driver_30',
        result: await sendOnce(
          supabase,
          job.id,
          'driver_30',
          driverLineId,
          reminderFlex(job, 'driver_30', carLabel, driverLabel),
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
            reminderFlex(job, 'driver_10', carLabel, driverLabel),
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
            reminderFlex(job, 'related_10', carLabel, driverLabel),
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
