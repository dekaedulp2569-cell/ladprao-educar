// Supabase Edge Function: daily-summary
// สรุปงานของวันถัดไป เวลา 16:00 น. (Asia/Bangkok)
// ส่งเข้ากลุ่ม LINE เริ่มต้น + คนขับรถ + ผู้ที่เกี่ยวข้อง + ผู้ขอใช้รถ
//
// ต้องตั้งค่า secrets:
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID (ตัวสำรอง), CRON_SECRET (แนะนำ)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (มีให้อัตโนมัติใน Edge Function)
//
// ตั้งเวลาเรียกด้วย pg_cron + pg_net (09:00 UTC = 16:00 Asia/Bangkok)
// ดูตัวอย่างใน supabase/functions/README.md

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildMissionText,
  carTypeLabel,
  corsHeaders,
  formatThaiDate,
  json,
  pushFlex,
  resolveGroupId,
} from '../_shared/line.ts'

const BANGKOK_OFFSET_MINUTES = 7 * 60
const SUMMARY_COLOR = '#0284C7'

function bangkokDateKey(date: Date) {
  const local = new Date(date.getTime() + BANGKOK_OFFSET_MINUTES * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

function summaryContents(title: string, lines: string[], color: string) {
  const lineGroups: string[][] = []
  for (let index = 0; index < lines.length; index += 96) {
    lineGroups.push(lines.slice(index, index + 96))
  }
  if (!lineGroups.length) lineGroups.push([])

  return lineGroups.map((lineGroup) => {
    const cards: Record<string, unknown>[] = []
    for (let index = 0; index < Math.max(lineGroup.length, 1); index += 8) {
      const chunk = lineGroup.slice(index, index + 8)
      cards.push({
        type: 'bubble',
        styles: { header: { backgroundColor: color } },
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: 'EduLP Car • สรุปงานประจำวัน (16:00 น.)',
              color: '#D1FAE5',
              size: 'sm',
              weight: 'bold',
              wrap: true,
            },
            { type: 'text', text: title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
          ],
        },
        body: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          contents: chunk.length
            ? chunk.map((line) => ({
                type: 'text',
                text: line,
                size: 'sm',
                color: '#374151',
                wrap: true,
              }))
            : [
                {
                  type: 'text',
                  text: 'ไม่มีรายการที่ได้รับอนุมัติสำหรับวันพรุ่งนี้',
                  size: 'md',
                  color: '#4B5563',
                  wrap: true,
                },
              ],
        },
      })
    }
    return cards.length === 1 ? cards[0] : { type: 'carousel', contents: cards }
  })
}

type Recipient = { label: string; lines: string[] }

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

  // งานของ "พรุ่งนี้" ตามเวลาไทย
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

  // รวมผู้รับเป็นรายคน เพื่อไม่ให้ส่งซ้ำเมื่อคนเดียวมีหลายบทบาท
  const personal = new Map<string, Recipient>()
  const groupLines: string[] = []

  const addPersonalLine = (lineUserId: string, label: string, line: string) => {
    if (!lineUserId) return
    const current = personal.get(lineUserId)
    if (current) {
      if (!current.lines.includes(line)) current.lines.push(line)
      return
    }
    personal.set(lineUserId, { label, lines: [line] })
  }

  for (let i = 0; i < (jobs || []).length; i += 1) {
    const job = jobs[i]
    const driver = job.assigned_driver_id ? driverById.get(job.assigned_driver_id) : null
    const car = job.assigned_car_id ? carById.get(job.assigned_car_id) : null
    const carLabel = car
      ? `${car.license_plate} (${carTypeLabel(car.car_type)})`
      : job.external_car_info || 'ไม่ระบุรถ'
    const driverLabel = driver?.full_name || job.external_driver_name || 'ยังไม่ระบุคนขับ'

    const missionText = buildMissionText({
      index: i + 1,
      request: job as Record<string, unknown>,
      carLabel,
      driverLabel,
    })
    groupLines.push(missionText)

    if (driver?.line_user_id) {
      addPersonalLine(driver.line_user_id, 'งานขับรถของคุณ', missionText)
    }

    if (Array.isArray(job.related_line_user_ids)) {
      for (const relatedId of job.related_line_user_ids) {
        if (typeof relatedId === 'string' && relatedId.trim()) {
          addPersonalLine(relatedId.trim(), 'รายการใช้รถที่คุณเกี่ยวข้อง', missionText)
        }
      }
    }

    if (job.requester_auth_user_id) {
      const { data: requester } = await supabase
        .from('user_profiles')
        .select('line_user_id')
        .eq('auth_user_id', job.requester_auth_user_id)
        .maybeSingle()
      if (requester?.line_user_id) {
        addPersonalLine(requester.line_user_id, 'คำขอใช้รถของคุณ', missionText)
      }
    }
  }

  const results: unknown[] = []
  const dayLabel = formatThaiDate(dayStart)
  const lineGroupId = await resolveGroupId(supabase)

  for (const [lineUserId, recipient] of personal) {
    for (const contents of summaryContents(
      `${recipient.label} • ${dayLabel}`,
      recipient.lines,
      SUMMARY_COLOR,
    )) {
      results.push(await pushFlex(lineUserId, `สรุปงานประจำวัน ${dayLabel}`, contents))
    }
  }

  for (const contents of summaryContents(
    `ภารกิจรถราชการ • ${dayLabel}`,
    groupLines,
    SUMMARY_COLOR,
  )) {
    results.push(
      await pushFlex(lineGroupId, `สรุปตารางการใช้รถราชการวันพรุ่งนี้ ${dayLabel}`, contents),
    )
  }

  const failed = results.some(
    (result) => typeof result === 'object' && result !== null && 'ok' in result && !result.ok,
  )

  return json(
    {
      date: dayKey,
      jobs: jobs?.length || 0,
      personalRecipients: personal.size,
      groupJobs: groupLines.length,
      groupConfigured: Boolean(lineGroupId),
      results,
    },
    failed ? 502 : 200,
  )
})
