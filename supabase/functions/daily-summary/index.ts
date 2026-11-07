// Supabase Edge Function: daily-summary
// โหมดรายวัน: ส่งเวลา 15:30 น. (สรุปงานพรุ่งนี้)
// โหมดรายสัปดาห์: ส่งวันอาทิตย์ 14:00 น. (สรุปจันทร์-อาทิตย์สัปดาห์ถัดไป แยกตามคนขับ)
//
// ตั้งค่า secrets:
//   LINE_CHANNEL_ACCESS_TOKEN, LINE_GROUP_ID (ตัวสำรอง), CRON_SECRET (แนะนำ)
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (มีให้อัตโนมัติใน Edge Function)
//
// pg_cron:
//   daily-summary:  '30 8 * * *'  (08:30 UTC = 15:30 เวลาไทย)
//   weekly-summary: '0 7 * * 0'   (07:00 UTC = 14:00 เวลาไทย วันอาทิตย์)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  buildMissionText,
  carTypeLabel,
  corsHeaders,
  formatThaiDate,
  formatThaiTime,
  json,
  pushFlex,
  resolveGroupId,
} from '../_shared/line.ts'

const BANGKOK_OFFSET_MINUTES = 7 * 60
const SUMMARY_COLOR = '#0284C7' // 🔵 สีฟ้า-น้ำเงิน สำหรับสรุปงาน

const WEEKDAY_TH: Record<string, string> = {
  Mon: 'จ.',
  Tue: 'อ.',
  Wed: 'พ.',
  Thu: 'พฤ.',
  Fri: 'ศ.',
  Sat: 'ส.',
  Sun: 'อา.',
}
const THAI_MONTHS_SHORT_LOCAL = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

/** จ. 9 พ.ย. (เส้นเวลาไทย) สำหรับหัวข้องานรายวันในสรุปรายสัปดาห์ */
function weekdayShort(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).formatToParts(date)
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
    const weekday = WEEKDAY_TH[map.weekday] || ''
    const month = THAI_MONTHS_SHORT_LOCAL[Number(map.month) - 1] || ''
    return `${weekday} ${map.day} ${month}`.trim()
  } catch {
    return ''
  }
}

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
              text: 'EduLP Car • สรุปงานประจำวัน (15:30 น.)',
              color: '#E0F2FE',
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
                  text: 'ไม่มีรายการที่ได้รับอนุมัติ',
                  size: 'sm',
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

/** 🔵 การ์ดกลุ่มสรุป: หัวกลุ่มคนขับ+รถเน้นตัวหนาสีฟ้า, บรรทัดงานภายใต้กลุ่ม, แบ่งเป็นหลาย bubble ได้ */
type DailyGroup = { title: string; lines: string[] }

function dailyGroupContents(
  title: string,
  groups: DailyGroup[],
  tailText: string,
  color: string,
) {
  const buckets: DailyGroup[][] = []
  for (let index = 0; index < Math.max(groups.length, 1); index += 5) {
    buckets.push(groups.slice(index, index + 5))
  }
  if (!buckets.length) buckets.push([])

  return buckets.map((bucket, bucketIndex) => {
    const rows: Record<string, unknown>[] = []
    bucket.forEach((group, groupIndex) => {
      if (groupIndex > 0) rows.push({ type: 'separator', margin: 'sm' })
      rows.push({
        type: 'text',
        text: group.title,
        size: 'sm',
        weight: 'bold',
        color: '#0369A1',
        wrap: true,
      })
      for (const line of group.lines) {
        rows.push({ type: 'text', text: line, size: 'xs', color: '#374151', wrap: true })
      }
    })
    if (!bucket.length) {
      rows.push({
        type: 'text',
        text: 'ไม่มีรายการที่ได้รับอนุมัติ',
        size: 'sm',
        color: '#4B5563',
        wrap: true,
      })
    }
    if (tailText && bucketIndex === buckets.length - 1) {
      rows.push({ type: 'separator', margin: 'sm' })
      rows.push({
        type: 'text',
        text: tailText,
        size: 'xs',
        weight: 'bold',
        color: '#0369A1',
        wrap: true,
      })
    }
    return {
      type: 'bubble',
      styles: { header: { backgroundColor: color } },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'EduLP Car • สรุปงานประจำวัน (15:30 น.)',
            color: '#E0F2FE',
            size: 'xs',
            weight: 'bold',
            wrap: true,
          },
          { type: 'text', text: title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'xs', contents: rows },
    }
  })
}

function weeklySummaryContents(title: string, driverGroups: Map<string, string[]>, color: string) {
  const cards: Record<string, unknown>[] = []
  for (const [driverName, lines] of driverGroups) {
    cards.push({
      type: 'bubble',
      styles: { header: { backgroundColor: color } },
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'text',
            text: 'EduLP Car • สรุปรายสัปดาห์ (อาทิตย์ 14:00 น.)',
            color: '#E0F2FE',
            size: 'sm',
            weight: 'bold',
            wrap: true,
          },
          { type: 'text', text: `🚙 ${driverName}`, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: lines.length
          ? lines.map((line) => ({
              type: 'text',
              text: line,
              size: 'sm',
              color: '#374151',
              wrap: true,
            }))
          : [
              {
                type: 'text',
                text: 'ไม่มีงานในสัปดาห์นี้',
                size: 'sm',
                color: '#4B5563',
                wrap: true,
              },
            ],
      },
    })
  })
  return [cards.length === 1 ? cards[0] : { type: 'carousel', contents: cards }]
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

  // อ่านพารามิเตอร์จาก body (สำหรับ weekly mode)
  let isWeekly = false
  try {
    const body = await req.json()
    isWeekly = body?.weekly === true
  } catch {
    // ไม่มี body หรือไม่ใช่ JSON ใช้ค่าเริ่มต้น isWeekly = false
  }

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

  if (isWeekly) {
    // ==========================================
    // โหมดรายสัปดาห์: สรุปจันทร์-อาทิตย์สัปดาห์ถัดไป
    // ==========================================
    const now = new Date()
    const nowBkk = new Date(now.getTime() + BANGKOK_OFFSET_MINUTES * 60 * 1000)

    // หาวันจันทร์ของสัปดาห์ถัดไป (สัปดาห์เริ่มวันจันทร์)
    const nextMonday = new Date(nowBkk)
    nextMonday.setDate(nextMonday.getDate() + ((7 - nextMonday.getDay() + 1) % 7 || 7))
    nextMonday.setHours(0, 0, 0, 0)

    // หาวันอาทิตย์ของสัปดาห์ถัดไป
    const nextSunday = new Date(nextMonday)
    nextSunday.setDate(nextSunday.getDate() + 6)
    nextSunday.setHours(23, 59, 59, 999)

    const weekStart = nextMonday.toISOString()
    const weekEnd = nextSunday.toISOString()

    const { data: jobs, error } = await supabase
      .from('car_requests')
      .select('*')
      .eq('status', 'approved')
      .gte('start_datetime', weekStart)
      .lte('start_datetime', weekEnd)
      .order('start_datetime', { ascending: true })

    if (error) return json({ error: error.message }, 500)

    // จัดกลุ่มงานตามคนขับ
    const driverGroups = new Map<string, string[]>()
    const unassignedJobs: string[] = []

    for (let i = 0; i < (jobs || []).length; i += 1) {
      const job = jobs[i]
      const driver = job.assigned_driver_id ? driverById.get(job.assigned_driver_id) : null
      const car = job.assigned_car_id ? carById.get(job.assigned_car_id) : null
      const carLabel = car
        ? `${car.license_plate} (${carTypeLabel(car.car_type)})`
        : job.external_car_info || 'ไม่ระบุรถ'
      const driverLabel = driver
        ? `${driver.nickname ? driver.nickname + ' - ' : ''}${driver.full_name}`
        : 'ยังไม่ระบุคนขับ'

      // บรรทัดย่อรายวัน: จ. 9 พ.ย.: เวลา 08:30 - 12:00 น. → ปลายทาง • รถ
      const start = formatThaiTime(job.start_datetime)
      const end = formatThaiTime(job.end_datetime)
      const destination = `${job.destination || '-'}${
        job.destination_province ? ` (${job.destination_province})` : ''
      }`

      const groupKey = driverLabel
      if (!driverGroups.has(groupKey)) {
        driverGroups.set(groupKey, [])
      }
      driverGroups
        .get(groupKey)!
        .push(`${weekdayShort(job.start_datetime)}: เวลา ${start} - ${end} น. → ${destination} • ${carLabel}`)
    }

    // คนขับที่ไม่มีงานในสัปดาห์นี้ ก็ยังแสดงการ์ดว่าไม่มีงาน
    for (const [driverId, driver] of driverById) {
      const driverLabel = `${driver.nickname ? driver.nickname + ' - ' : ''}${driver.full_name}`
      if (!driverGroups.has(driverLabel)) {
        driverGroups.set(driverLabel, [])
      }
    }

    // พร้อมการ์ด: ใส่เลขลำดับภารกิจของแต่ละคนขับ
    for (const [groupKey, lines] of driverGroups) {
      if (lines.length) {
        driverGroups.set(groupKey, lines.map((line, index) => `${index + 1}. ${line}`))
      }
    }

    const results: unknown[] = []
    const lineGroupId = await resolveGroupId(supabase)

    const dayLabel = formatThaiDate(nextMonday)
    const endDayLabel = formatThaiDate(nextSunday)

    for (const contents of weeklySummaryContents(
      `สรุปงานรายสัปดาห์ ${dayLabel} - ${endDayLabel}`,
      driverGroups,
      SUMMARY_COLOR,
    )) {
      results.push(
        await pushFlex(
          lineGroupId,
          `สรุปตารางงานรายสัปดาห์ ${dayLabel} ถึง ${endDayLabel}`,
          contents,
        ),
      )
    }

    const failed = results.some(
      (result) => typeof result === 'object' && result !== null && 'ok' in result && !result.ok,
    )

    return json(
      {
        type: 'weekly',
        weekStart,
        weekEnd,
        jobs: jobs?.length || 0,
        driverGroups: driverGroups.size,
        groupConfigured: Boolean(lineGroupId),
        results,
      },
      failed ? 502 : 200,
    )
  }

  // ==========================================
  // โหมดรายวัน: สรุปงานพรุ่งนี้ (เดิม)
  // ==========================================
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

  const personal = new Map<string, Recipient>()
  const dailyGroups: DailyGroup[] = []
  const groupByKey = new Map<string, DailyGroup>()

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

    // 🔵 กลุ่มสรุปสำหรับประกาศใน LINE Group: จัดกลุ่มตาม คนขับ + รถ
    const groupKey = `${driverLabel} • ${carLabel}`
    if (!groupByKey.has(groupKey)) {
      const group: DailyGroup = { title: `🚌 ${driverLabel} — ${carLabel}`, lines: [] }
      groupByKey.set(groupKey, group)
      dailyGroups.push(group)
    }
    const destination = `${job.destination || '-'}${
      job.destination_province ? ` (${job.destination_province})` : ''
    }`
    groupByKey
      .get(groupKey)!
      .lines.push(`${formatThaiTime(job.start_datetime)} - ${formatThaiTime(job.end_datetime)} น. → ${destination}`)

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

  // เรียงลำดับภารกิจต่อกลุ่ม (1., 2., ...)
  for (const group of dailyGroups) {
    group.lines = group.lines.map((line, index) => `${index + 1}. ${line}`)
  }

  for (const [lineUserId, recipient] of personal) {
    for (const contents of summaryContents(
      `${recipient.label} • ${dayLabel}`,
      recipient.lines,
      SUMMARY_COLOR,
    )) {
      results.push(await pushFlex(lineUserId, `สรุปงานประจำวัน ${dayLabel}`, contents))
    }
  }

  for (const contents of dailyGroupContents(
    `ภารกิจรถราชการ • ${dayLabel}`,
    dailyGroups,
    `รวม ${jobs?.length || 0} คิว • เฉพาะคำขอ "อนุมัติแล้ว"`,
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
      type: 'daily',
      date: dayKey,
      jobs: jobs?.length || 0,
      personalRecipients: personal.size,
      groupJobs: dailyGroups.reduce((sum, group) => sum + group.lines.length, 0),
      groupConfigured: Boolean(lineGroupId),
      results,
    },
    failed ? 502 : 200,
  )
})