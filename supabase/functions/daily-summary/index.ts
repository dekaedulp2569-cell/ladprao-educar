// Supabase Edge Function: daily-summary
// สรุปงานของพนักงานขับรถประจำวัน เวลา 16:30 น. (Asia/Bangkok)
//
// ต้องตั้งค่า secrets:
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (มีให้อัตโนมัติใน Edge Function)
//   CRON_SECRET (แนะนำ) — ต้องส่ง header x-cron-secret ตรงกัน
//
// ตั้งเวลาเรียกด้วย pg_cron + pg_net ดูตัวอย่างใน supabase/functions/README.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  corsHeaders,
  formatThaiDate,
  formatThaiTime,
  groupId,
  json,
  pushText,
} from '../_shared/line.ts'

const BANGKOK_OFFSET_MINUTES = 7 * 60

function bangkokDateKey(date: Date) {
  const local = new Date(date.getTime() + BANGKOK_OFFSET_MINUTES * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret && req.headers.get('x-cron-secret') !== cronSecret) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'ยังไม่ได้ตั้งค่า SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY' }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  // งานของ "พรุ่งนี้" ตามเวลาไทย (สรุปตอนเย็นเพื่อเตรียมงานวันถัดไป)
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const dayKey = bangkokDateKey(tomorrow)
  const dayStart = new Date(`${dayKey}T00:00:00+07:00`)
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)

  const { data: jobs, error } = await supabase
    .from('car_requests')
    .select('*')
    .eq('status', 'approved')
    .gte('start_datetime', dayStart.toISOString())
    .lt('start_datetime', dayEnd.toISOString())
    .order('start_datetime', { ascending: true })

  if (error) return json({ error: error.message }, 500)

  const { data: cars } = await supabase.from('cars').select('*')
  const { data: drivers } = await supabase.from('drivers').select('*')

  const carById = new Map((cars || []).map((car) => [car.id, car]))
  const driverById = new Map((drivers || []).map((driver) => [driver.id, driver]))

  const personal = new Map<string, string[]>()
  const external: string[] = []

  for (const job of jobs || []) {
    const driver = job.assigned_driver_id ? driverById.get(job.assigned_driver_id) : null
    const car = job.assigned_car_id ? carById.get(job.assigned_car_id) : null
    const carLabel = car
      ? `${car.license_plate} (${car.car_type === 'van' ? 'รถตู้' : car.car_type === 'pickup' ? 'รถกระบะ' : 'รถ'})`
      : job.external_car_info || 'ไม่ระบุรถ'

    const line = `• ${formatThaiTime(job.start_datetime)} - ${formatThaiTime(job.end_datetime)} น. ${job.destination} (${job.destination_province}) · ${job.requester_name}`

    if (driver?.dept === 'education' && driver.line_user_id) {
      if (!personal.has(driver.line_user_id)) personal.set(driver.line_user_id, [])
      personal.get(driver.line_user_id)!.push(line)
    } else {
      // คนขับฝ่ายอื่น หรือยังไม่ระบุคนขับ → สรุปเข้ากลุ่มกลางเท่านั้น
      const who = driver?.full_name || job.external_driver_name || 'ยังไม่ระบุคนขับ'
      external.push(`• ${formatThaiTime(job.start_datetime)} ${job.destination} · ${who} · ${carLabel}`)
    }
  }

  const results: unknown[] = []
  const dayLabel = formatThaiDate(dayStart)

  for (const [lineUserId, lines] of personal) {
    const text = [
      `🚐 สรุปงานประจำวัน ${dayLabel} (เวลาไทย)`,
      `ทั้งหมด ${lines.length} งาน`,
      '',
      ...lines,
    ].join('\n')
    results.push(await pushText(lineUserId, text))
  }

  if (external.length > 0 || personal.size === 0) {
    const text = [
      `📋 สรุปงานรถราชการ ฝ่ายการศึกษา ${dayLabel}`,
      external.length > 0 ? `งานที่มอบหมายคนขับฝ่ายอื่น/ยังไม่ระบุ: ${external.length} งาน` : '',
      '',
      ...external,
    ]
      .filter(Boolean)
      .join('\n')
    results.push(await pushText(groupId(), text))
  }

  return json({
    date: dayKey,
    jobs: jobs?.length || 0,
    personalDrivers: personal.size,
    externalJobs: external.length,
    results,
  })
})
