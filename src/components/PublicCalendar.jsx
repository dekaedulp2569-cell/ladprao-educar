import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  STATUS,
  classNames,
  carTypeDisplay,
  dateKey,
  formatDate,
  formatTime,
  monthLabel,
} from '../lib/helpers'
import { Card, EmptyState, SectionTitle, Spinner } from './ui'

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

const THAI_WEEKDAYS_FULL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

// ไอคอนรถตามประเภท (ข้อความอิสระที่พิมพ์เองใช้ 🚗 เป็นค่าเริ่มต้น)
const CAR_ICONS = { van: '🚐', pickup: '🛻', sedan: '🚗', bus: '🚌', other: '🚙' }

function carIcon(carType) {
  return CAR_ICONS[carType] || '🚗'
}

function monthMatrix(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < firstDay; i += 1) cells.push(null)
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(new Date(year, month, day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

export function PublicCalendar() {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedKey, setSelectedKey] = useState(dateKey(today))
  const [carFilter, setCarFilter] = useState('all')
  // มุมมอง: ปฏิทินรายเดือน / รายการคิวรถ (ค่าเริ่มต้น: จอเล็กกว่า 640px → รายการคิว อ่านง่ายกว่าบนมือถือ)
  const [view, setView] = useState(() =>
    typeof window !== 'undefined' && window.innerWidth < 640 ? 'list' : 'calendar',
  )
  const [requests, setRequests] = useState([])
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [requestResult, carResult] = await Promise.all([
      supabase
        .from('public_car_calendar')
        .select('id, status, destination, destination_province, start_datetime, end_datetime, assigned_car_id, external_car_info')
        .in('status', ['approved', 'tentative'])
        .order('start_datetime', { ascending: true }),
      supabase.from('cars').select('*').order('created_at', { ascending: true }),
    ])

    if (requestResult.error || carResult.error) {
      setError('ไม่สามารถโหลดข้อมูลปฏิทินได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูล')
    } else {
      setRequests(requestResult.data || [])
      setCars(carResult.data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const carById = useMemo(() => {
    const map = new Map()
    cars.forEach((car) => map.set(car.id, car))
    return map
  }, [cars])

  const filteredRequests = useMemo(() => {
    if (carFilter === 'all') return requests
    return requests.filter((item) => item.assigned_car_id === carFilter)
  }, [requests, carFilter])

  const eventsByDay = useMemo(() => {
    const map = new Map()
    filteredRequests.forEach((request) => {
      const start = new Date(request.start_datetime)
      const end = new Date(request.end_datetime)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return

      const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      let guard = 0
      while (cursor <= end && guard < 90) {
        const key = dateKey(cursor)
        if (!map.has(key)) map.set(key, [])
        map.get(key).push(request)
        cursor.setDate(cursor.getDate() + 1)
        guard += 1
      }
    })
    return map
  }, [filteredRequests])

  const cells = useMemo(() => monthMatrix(year, month), [year, month])
  const selectedEvents = eventsByDay.get(selectedKey) || []

  const moveMonth = (delta) => {
    const next = new Date(year, month + delta, 1)
    setYear(next.getFullYear())
    setMonth(next.getMonth())
  }

  const goToday = () => {
    const now = new Date()
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setSelectedKey(dateKey(now))
  }

  const monthRequestCount = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    let count = 0
    eventsByDay.forEach((events, key) => {
      if (key.startsWith(prefix)) count += events.length
    })
    return count
  }, [eventsByDay, year, month])

  // แถบสรุปวันนี้: งานที่คาบวันนี้ (ทุกสถานะที่แสดงบนปฏิทิน) + รถที่ยังว่าง
  // ใช้ข้อมูลรวมไม่ผ่านตัวกรองรถ เพื่อให้จำนวน "รถว่าง" ถูกต้องเสมอ
  const todayAllEvents = useMemo(() => {
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return requests.filter((request) => {
      const start = new Date(request.start_datetime)
      const end = new Date(request.end_datetime)
      return (
        !Number.isNaN(start.getTime()) &&
        !Number.isNaN(end.getTime()) &&
        start < dayEnd &&
        end > dayStart
      )
    })
  }, [requests])

  const todayCount = useMemo(() => {
    if (carFilter === 'all') return todayAllEvents.length
    return todayAllEvents.filter((item) => item.assigned_car_id === carFilter).length
  }, [todayAllEvents, carFilter])

  const freeCarsCount = useMemo(() => {
    const busyCarIds = new Set(todayAllEvents.map((item) => item.assigned_car_id).filter(Boolean))
    return cars.filter((car) => !busyCarIds.has(car.id)).length
  }, [todayAllEvents, cars])

  // แท็บรายการคิว: งานที่ยังไม่จบ (end > วันนี้) เรียงตามวัน-เวลา จัดกลุ่มตามวันเริ่ม
  const upcomingGroups = useMemo(() => {
    const now = new Date()
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const todayKeyValue = dateKey(dayStart)
    const groups = new Map()
    filteredRequests.forEach((request) => {
      const start = new Date(request.start_datetime)
      const end = new Date(request.end_datetime)
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return
      if (end <= dayStart) return // จบก่อนวันนี้แล้ว ไม่แสดงในแท็บรายการ
      const startKey = dateKey(start)
      // งานต่อเนื่องที่เริ่มก่อนวันนี้ → รวมไว้ใต้หัวข้อวันนี้
      const groupKey = start < dayStart ? todayKeyValue : startKey
      if (!groups.has(groupKey)) groups.set(groupKey, [])
      groups.get(groupKey).push(request)
    })
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, items]) => [
        key,
        items.sort((a, b) => new Date(a.start_datetime) - new Date(b.start_datetime)),
      ])
  }, [filteredRequests])

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-700 via-brand-800 to-emerald-900 px-5 py-6 text-white shadow-lg sm:px-8 sm:py-8">
        <p className="text-xs font-medium tracking-wide text-brand-100 sm:text-sm">
          สำนักงานเขตลาดพร้าว · ฝ่ายการศึกษา
        </p>
        <h1 className="mt-2 text-2xl font-bold leading-tight sm:text-3xl">
          ปฏิทินสถานะการใช้รถราชการ
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-brand-100">
          ตรวจสอบวันและเวลาที่รถว่างได้ทันที ไม่ต้องเข้าสู่ระบบ
          เพื่อป้องกันการจองซ้ำซ้อนก่อนยื่นคำขอใช้รถ
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs text-brand-100">รถในระบบ</p>
            <p className="mt-1 text-xl font-bold">{cars.length} คัน</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs text-brand-100">รายการเดือนนี้</p>
            <p className="mt-1 text-xl font-bold">{monthRequestCount} รายการ</p>
          </div>
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs text-brand-100">อนุมัติแล้ว</p>
            <p className="mt-1 text-xl font-bold">
              {requests.filter((item) => item.status === 'approved').length} รายการ
            </p>
          </div>
        </div>
        {/* แถบสรุปสถานะวันนี้: คิวเดินทางวันนี้ + รถที่ยังว่าง */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-white/25 bg-white/15 px-4 py-2.5 text-sm font-semibold backdrop-blur">
          <span>📅 วันนี้มีคิวเดินทาง <b>{todayCount} งาน</b></span>
          <span className="hidden text-white/50 sm:inline">|</span>
          <span>🚗 รถว่างพร้อมใช้งาน <b>{freeCarsCount} คัน</b></span>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {/* แถบสลับมุมมอง: ปฏิทินรายเดือน / รายการคิวรถ (อ่านง่ายบนมือถือ) */}
        <div className="flex gap-2 px-4 pt-4 sm:px-6">
          <button
            type="button"
            onClick={() => setView('calendar')}
            className={classNames(
              'rounded-t-xl border border-b-0 px-3.5 py-2 text-xs font-semibold transition sm:text-sm',
              view === 'calendar'
                ? 'border-slate-200 bg-white text-brand-700'
                : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200/70',
            )}
          >
            📅 ปฏิทินรายเดือน
          </button>
          <button
            type="button"
            onClick={() => setView('list')}
            className={classNames(
              'rounded-t-xl border border-b-0 px-3.5 py-2 text-xs font-semibold transition sm:text-sm',
              view === 'list'
                ? 'border-slate-200 bg-white text-brand-700'
                : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200/70',
            )}
          >
            📋 รายการคิวรถ (อ่านง่ายบนมือถือ)
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6">
          {view === 'calendar' ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => moveMonth(-1)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                aria-label="เดือนก่อนหน้า"
              >
                ‹
              </button>
              <p className="min-w-[9rem] text-center text-base font-semibold text-slate-800 sm:text-lg">
                {monthLabel(year, month)}
              </p>
              <button
                type="button"
                onClick={() => moveMonth(1)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
                aria-label="เดือนถัดไป"
              >
                ›
              </button>
              <button
                type="button"
                onClick={goToday}
                className="ml-1 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs font-medium text-brand-700 transition hover:bg-brand-100"
              >
                วันนี้
              </button>
            </div>
          ) : (
            <p className="text-sm font-semibold text-slate-700">📋 รายการนับจากวันนี้เป็นต้นไป</p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={carFilter}
              onChange={(event) => setCarFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">🚗 รถทั้งหมด ({cars.length} คัน)</option>
              {cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {carIcon(car.car_type)} {carTypeDisplay(car.car_type)} ({car.license_plate})
                </option>
              ))}
            </select>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" /> อนุมัติแล้ว
            </span>
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
              <span className="h-2 w-2 rounded-full bg-amber-500" /> รอ ผอ.เขต
            </span>
          </div>
        </div>

        {loading ? (
          <Spinner />
        ) : view === 'calendar' ? (
          <div className="p-3 sm:p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-2">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((date, index) => {
                if (!date) {
                  return <div key={`empty-${index}`} className="min-h-[72px] rounded-lg bg-slate-50/60" />
                }
                const key = dateKey(date)
                const events = eventsByDay.get(key) || []
                const isToday = key === dateKey(today)
                const isSelected = key === selectedKey
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedKey(key)}
                    className={classNames(
                      'min-h-[72px] rounded-lg border p-1.5 text-left transition sm:min-h-[92px] sm:p-2',
                      isSelected
                        ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200'
                        : 'border-slate-200 bg-white hover:border-brand-300 hover:bg-brand-50/40',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={classNames(
                          'flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold',
                          isToday ? 'bg-brand-700 text-white' : 'text-slate-600',
                        )}
                      >
                        {date.getDate()}
                      </span>
                      {events.length > 0 ? (
                        <span className="rounded-full bg-brand-100 px-1.5 py-0.5 text-[10px] font-medium text-brand-800">
                          {events.length}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 hidden space-y-1 sm:block">
                      {events.slice(0, 2).map((event) => (
                        <div
                          key={event.id}
                          className={classNames(
                            'truncate rounded px-1 py-0.5 text-[10px]',
                            event.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-amber-100 text-amber-700',
                          )}
                        >
                          {carById.get(event.assigned_car_id)?.license_plate || event.external_car_info || 'ยังไม่จัดสรรรถ'}
                        </div>
                      ))}
                      {events.length > 2 ? (
                        <p className="text-[10px] text-slate-400">+{events.length - 2} รายการ</p>
                      ) : null}
                    </div>
                    <div className="mt-1 flex gap-0.5 sm:hidden">
                      {events.slice(0, 3).map((event) => (
                        <span
                          key={event.id}
                          className={classNames(
                            'h-1.5 w-1.5 rounded-full',
                            event.status === 'approved' ? 'bg-emerald-500' : 'bg-amber-500',
                          )}
                        />
                      ))}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ) : (
          <div className="p-3 sm:p-4">
            {upcomingGroups.length === 0 ? (
              <EmptyState
                title="ยังไม่มีคิวเดินทางนับจากวันนี้"
                description="รถทุกคันว่าง — สามารถยื่นคำขอใช้รถได้ตามขั้นตอน"
              />
            ) : (
              <div className="space-y-4">
                {upcomingGroups.map(([groupKey, groupItems]) => {
                  const [groupYear, groupMonth, groupDay] = groupKey.split('-').map(Number)
                  const weekdayFull = THAI_WEEKDAYS_FULL[new Date(groupYear, groupMonth - 1, groupDay).getDay()]
                  const isTodayGroup = groupKey === dateKey(today)
                  const tomorrowKey = dateKey(
                    new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1),
                  )
                  const isTomorrowGroup = groupKey === tomorrowKey
                  return (
                    <div key={groupKey}>
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-sm font-bold text-slate-800">
                          วัน{weekdayFull}ที่ {formatDate(`${groupKey}T12:00:00+07:00`, false)}
                        </p>
                        {isTodayGroup ? (
                          <span className="rounded-full bg-brand-700 px-2 py-0.5 text-[10px] font-bold text-white">
                            วันนี้
                          </span>
                        ) : isTomorrowGroup ? (
                          <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-bold text-brand-700">
                            พรุ่งนี้
                          </span>
                        ) : null}
                      </div>
                      <div className="space-y-2.5">
                        {groupItems.map((event) => {
                          const car = carById.get(event.assigned_car_id)
                          const startKey = dateKey(new Date(event.start_datetime))
                          const isContinuing = startKey < groupKey
                          return (
                            <div
                              key={event.id}
                              className="rounded-xl border border-slate-200 border-l-4 bg-white p-3.5 shadow-sm"
                              style={{
                                borderLeftColor: event.status === 'approved' ? '#059669' : '#D97706',
                              }}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
                                  ⏰ {formatTime(event.start_datetime)} - {formatTime(event.end_datetime)} น.
                                </span>
                                <StatusBadgeInline status={event.status} />
                              </div>
                              <h4 className="mt-2.5 text-sm font-bold leading-snug text-slate-900">
                                📍 {event.destination}
                              </h4>
                              <p className="mt-0.5 text-xs font-medium text-slate-500">
                                {event.destination_province || 'กรุงเทพมหานคร'}
                                {isContinuing
                                  ? ` · ⏱️ ต่อเนื่องตั้งแต่ ${formatDate(`${startKey}T12:00:00+07:00`, false)}`
                                  : ''}
                              </p>
                              <div className="mt-2.5 flex items-center gap-2 border-t border-dashed border-slate-200 pt-2.5 text-xs font-semibold text-slate-700">
                                <span className="text-base">{carIcon(car?.car_type)}</span>
                                {car
                                  ? `${carTypeDisplay(car.car_type)} · ${car.license_plate}`
                                  : event.external_car_info || 'ยังไม่ระบุรถ'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                <p className="pt-1 text-center text-[11px] text-slate-400">
                  ตารางนี้แสดงเฉพาะช่วงเวลาและสถานที่ เพื่อคุ้มครองข้อมูลผู้ขอ
                </p>
              </div>
            )}
          </div>
        )}
      </Card>

      {view === 'calendar' ? (
      <Card className="p-4 sm:p-6">
        <SectionTitle
          title={`รายการใช้รถวันที่ ${formatDate(`${selectedKey}T12:00:00+07:00`, false)}`}
          subtitle={`แสดงเฉพาะรายการที่อนุมัติแล้วและรอ ผอ.เขต (ทั้งหมด ${selectedEvents.length} รายการ)`}
        />
        {selectedEvents.length === 0 ? (
          <EmptyState
            title="ไม่มีคิวเดินทางในวันนี้"
            description="รถทุกคันว่าง — ยื่นคำขอใช้รถได้ตามขั้นตอน"
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {selectedEvents.map((event) => {
              const car = carById.get(event.assigned_car_id)

              return (
                <div
                  key={event.id}
                  className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-brand-300 hover:shadow-md"
                >
                  <div className="space-y-3">
                    {/* ส่วนหัว Card: เวลา และ สถานะ */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <span className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
                        ⏰ {formatTime(event.start_datetime)} - {formatTime(event.end_datetime)} น.
                      </span>
                      <StatusBadgeInline status={event.status} />
                    </div>

                    {/* ปลายทาง และ จังหวัด */}
                    <div>
                      <h4 className="text-base font-bold text-slate-900 leading-snug">
                        📍 {event.destination}
                      </h4>
                      <p className="mt-0.5 text-xs text-slate-500 font-medium">
                        {event.destination_province || 'กรุงเทพมหานคร'}
                      </p>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-start gap-2 pt-1 border-t border-slate-100">
                        <span className="w-5 text-center text-slate-400">🚐</span>
                        <div className="flex-1">
                          <span className="font-semibold text-slate-800">
                            {car ? `${car.license_plate} (${carTypeDisplay(car.car_type)})` : event.external_car_info || 'ยังไม่ระบุรถ'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-100 pt-3 text-[11px] text-slate-400">
                    ตารางนี้แสดงเฉพาะช่วงเวลาและสถานที่ เพื่อคุ้มครองข้อมูลผู้ขอ
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
      ) : null}

    </div>
  )
}

function StatusBadgeInline({ status }) {
  const item = STATUS[status] || STATUS.pending
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${item.className}`}>
      {item.label}
    </span>
  )
}
