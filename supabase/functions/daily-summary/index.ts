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
  formatThaiDayDate,
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

/** เลขลำดับภารกิจในบล็อก: 1️⃣ 2️⃣ ... 9️⃣ และ 10. ขึ้นไป */
function missionSeq(index: number) {
  return index <= 9 ? `${index}\uFE0F\u20E3` : `${index}.`
}

/**
 * การ์ดส่วนตัว (สรุปรายวัน): หัวข้อ "📅 วัน...ที่ 09 พ.ย. 2569" +
 * บรรทัดแรกใต้หัวข้อบอกบริบทผู้รับ (งานขับรถของคุณ / คำขอใช้รถของคุณ / ...)
 * บล็อกละ 1 ภารกิจ (หลายบรรทัดใน text เดียว) — แบ่งหน้าตามจำนวนบรรทัด
 */
function summaryContents(title: string, subtitle: string, blocks: string[], color: string) {
  const pages: string[][] = []
  let current: string[] = []
  let lineCount = 0
  for (const block of blocks) {
    const blockLines = block.split('\n').length
    if (current.length && lineCount + blockLines > 14) {
      pages.push(current)
      current = []
      lineCount = 0
    }
    current.push(block)
    lineCount += blockLines
  }
  pages.push(current)

  return pages.map((page, pageIndex) => {
    const bodyContents: Record<string, unknown>[] = []
    if (pageIndex === 0 && subtitle) {
      bodyContents.push({
        type: 'text',
        text: subtitle,
        size: 'sm',
        weight: 'bold',
        color: '#0369A1',
        wrap: true,
      })
    }
    if (page.length) {
      for (const block of page) {
        bodyContents.push({ type: 'text', text: block, size: 'sm', color: '#374151', wrap: true })
      }
    } else {
      bodyContents.push({
        type: 'text',
        text: 'ไม่มีรายการที่ได้รับอนุมัติ',
        size: 'sm',
        color: '#4B5563',
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
            text: 'EduLP Car • สรุปงานพรุ่งนี้ (15:30 น.)',
            color: '#E0F2FE',
            size: 'sm',
            weight: 'bold',
            wrap: true,
          },
          { type: 'text', text: title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
        ],
      },
      body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
    }
  })
}

/** 🔵 การ์ดกลุ่มสรุป: หัวกลุ่มคนขับ (สีฟ้า) + บรรทัดรถ · เวลา ⏰ · ปลายทาง 📍 แยกบรรทัด */
type DailyJob = { time: string; dest: string }
type DailyGroup = { title: string; carLabel: string; jobs: DailyJob[] }

function dailyGroupContents(
  title: string,
  groups: DailyGroup[],
  tailText: string,
  color: string,
) {
  // แบ่งหน้าตามจำนวนบรรทัดประมาณการ ไม่ให้การ์ดยาวเกินไป
  const buckets: DailyGroup[][] = []
  let current: DailyGroup[] = []
  let lineEstimate = 0
  for (const group of groups) {
    const groupLines = 2 + Math.max(group.jobs.length, 1) * 2
    if (current.length && lineEstimate + groupLines > 24) {
      buckets.push(current)
      current = []
      lineEstimate = 0
    }
    current.push(group)
    lineEstimate += groupLines
  }
  if (current.length) buckets.push(current)
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
      rows.push({
        type: 'text',
        text: `🚗 ${group.carLabel}`,
        size: 'xs',
        color: '#0369A1',
        wrap: true,
      })
      group.jobs.forEach((job, jobIndex) => {
        rows.push({
          type: 'text',
          text: `${jobIndex + 1}. ⏰ ${job.time}`,
          size: 'xs',
          weight: 'bold',
          color: '#374151',
          wrap: true,
        })
        rows.push({
          type: 'text',
          text: `📍 ${job.dest}`,
          size: 'xs',
          color: '#374151',
          wrap: true,
        })
      })
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
            text: 'EduLP Car • สรุปงานพรุ่งนี้ (15:30 น.)',
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

/**
 * 🔵 การ์ดสรุปรายสัปดาห์: หัวข้อบอก "ช่วงสัปดาห์" (วันจันทร์–อาทิตย์) +
 * ชื่อคนขับเป็นบรรทัดแรกของเนื้อหา + บล็อกละ 1 งาน (วันเวลา / ปลายทาง / รถ)
 * แบ่งหน้าเมื่อยาว เพื่อกันข้อความถูกตัด
 */
function weeklySummaryContents(
  title: string,
  driverGroups: Map<string, string[][]>,
  color: string,
) {
  const cards: Record<string, unknown>[] = []
  for (const [driverName, blocks] of driverGroups) {
    // blocks = array ของบล็อก (แต่ละบล็อก = array บรรทัด) → รวมเป็นข้อความก่อนนับ/ส่ง
    const texts = blocks.map((lines) => lines.join('\n'))
    const pages: string[][] = []
    let current: string[] = []
    let lineCount = 0
    for (const block of texts) {
      const blockLines = block.split('\n').length
      if (current.length && lineCount + blockLines > 12) {
        pages.push(current)
        current = []
        lineCount = 0
      }
      current.push(block)
      lineCount += blockLines
    }
    pages.push(current)

    for (const page of pages) {
      const bodyContents: Record<string, unknown>[] = [
        {
          type: 'text',
          text: `🚙 ${driverName}`,
          size: 'sm',
          weight: 'bold',
          color: '#0369A1',
          wrap: true,
        },
      ]
      if (page.length) {
        for (const block of page) {
          bodyContents.push({ type: 'text', text: block, size: 'sm', color: '#374151', wrap: true })
        }
      } else {
        bodyContents.push({
          type: 'text',
          text: 'ไม่มีงานในสัปดาห์นี้',
          size: 'sm',
          color: '#4B5563',
          wrap: true,
        })
      }
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
            { type: 'text', text: title, color: '#FFFFFF', size: 'md', weight: 'bold', wrap: true },
          ],
        },
        body: { type: 'box', layout: 'vertical', spacing: 'sm', contents: bodyContents },
      })
    }
  }
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

    // จัดกลุ่มงานตามคนขับ — 1 งาน = 1 บล็อก 3 บรรทัด (วัน-เวลา / ปลายทาง / รถ)
    const driverGroups = new Map<string, string[][]>()

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

      const start = formatThaiTime(job.start_datetime)
      const end = formatThaiTime(job.end_datetime)
      const destination = `${job.destination || '-'}${
        job.destination_province ? ` (${job.destination_province})` : ''
      }`

      if (!driverGroups.has(driverLabel)) driverGroups.set(driverLabel, [])
      const blocks = driverGroups.get(driverLabel)!
      const number = blocks.length + 1
      blocks.push([
        `${number}. ${weekdayShort(job.start_datetime)} • ⏰ ${start} - ${end} น.`,
        `📍 ${destination}`,
        `🚗 ${carLabel}`,
      ])
    }

    // คนขับที่ไม่มีงานในสัปดาห์นี้ ก็ยังแสดงการ์ดว่าไม่มีงาน
    for (const [, driver] of driverById) {
      const driverLabel = `${driver.nickname ? driver.nickname + ' - ' : ''}${driver.full_name}`
      if (!driverGroups.has(driverLabel)) {
        driverGroups.set(driverLabel, [])
      }
    }

    const results: unknown[] = []
    const lineGroupId = await resolveGroupId(supabase)

    const dayLabel = formatThaiDate(nextMonday)
    const endDayLabel = formatThaiDate(nextSunday)

    for (const contents of weeklySummaryContents(
      `📅 วันจันทร์ที่ ${dayLabel} – วันอาทิตย์ที่ ${endDayLabel}`,
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
      request: job as Record<string, unknown>,
      carLabel,
      driverLabel,
    })

    // 🔵 กลุ่มสรุปสำหรับประกาศใน LINE Group: จัดกลุ่มตาม คนขับ + รถ
    const groupKey = `${driverLabel} • ${carLabel}`
    if (!groupByKey.has(groupKey)) {
      const group: DailyGroup = { title: `🚌 ${driverLabel}`, carLabel, jobs: [] }
      groupByKey.set(groupKey, group)
      dailyGroups.push(group)
    }
    const destination = `${job.destination || '-'}${
      job.destination_province ? ` (${job.destination_province})` : ''
    }`
    groupByKey.get(groupKey)!.jobs.push({
      time: `${formatThaiTime(job.start_datetime)} - ${formatThaiTime(job.end_datetime)} น.`,
      dest: destination,
    })

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
  const fullDayLabel = formatThaiDayDate(dayStart)
  const lineGroupId = await resolveGroupId(supabase)

  for (const [lineUserId, recipient] of personal) {
    // ใส่เลขลำดับ 1️⃣ 2️⃣ ... ตามลำดับของผู้รับแต่ละคน (คนขับ/ผู้ขอ/ผู้เกี่ยวข้อง คนละชุด)
    const blocks = recipient.lines.map((block, index) => {
      const [first, ...rest] = block.split('\n')
      return [`${missionSeq(index + 1)} ${first}`, ...rest].join('\n')
    })
    for (const contents of summaryContents(
      `📅 ${fullDayLabel}`,
      recipient.label,
      blocks,
      SUMMARY_COLOR,
    )) {
      results.push(await pushFlex(lineUserId, `สรุปงานประจำวัน ${dayLabel}`, contents))
    }
  }

  for (const contents of dailyGroupContents(
    `📅 ${fullDayLabel}`,
    dailyGroups,
    `✅ รวม ${jobs?.length || 0} คิว · เฉพาะคำขอที่อนุมัติแล้ว`,
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
      groupJobs: dailyGroups.reduce((sum, group) => sum + group.jobs.length, 0),
      groupConfigured: Boolean(lineGroupId),
      results,
    },
    failed ? 502 : 200,
  )
})