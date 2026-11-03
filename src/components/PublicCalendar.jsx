import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import {
  CAR_TYPE,
  STATUS,
  classNames,
  dateKey,
  formatDate,
  formatTime,
  monthLabel,
} from '../lib/helpers'
import { Card, EmptyState, SectionTitle, Spinner } from './ui'

const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']

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
  const [requests, setRequests] = useState([])
  const [cars, setCars] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    const [requestResult, carResult] = await Promise.all([
      supabase
        .from('car_requests')
        .select('*')
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
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
          <div className="rounded-xl bg-white/10 px-4 py-3 backdrop-blur">
            <p className="text-xs text-brand-100">รอ ผอ.เขต</p>
            <p className="mt-1 text-xl font-bold">
              {requests.filter((item) => item.status === 'tentative').length} รายการ
            </p>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-4 sm:px-6">
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

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={carFilter}
              onChange={(event) => setCarFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="all">รถทุกคัน</option>
              {cars.map((car) => (
                <option key={car.id} value={car.id}>
                  {car.license_plate} · {CAR_TYPE[car.car_type] || 'รถ'}
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
        ) : (
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
                          {carById.get(event.assigned_car_id)?.license_plate || event.external_car_info || 'ยังไม่สรรรถ'}
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
        )}
      </Card>

      <Card className="p-4 sm:p-6">
        <SectionTitle
          title={`รายการใช้รถวันที่ ${formatDate(`${selectedKey}T12:00:00`, false)}`}
          subtitle="แสดงเฉพาะรายการที่อนุมัติแล้วและรายการที่รอ ผอ.เขต อนุมัติ"
        />
        {selectedEvents.length === 0 ? (
          <EmptyState
            title="ไม่มีรายการใช้รถในวันนี้"
            description="รถทุกคันว่าง สามารถยื่นคำขอใช้รถได้ตามขั้นตอน"
          />
        ) : (
          <div className="space-y-3">
            {selectedEvents.map((event) => {
              const car = carById.get(event.assigned_car_id)
              return (
                <div
                  key={event.id}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">
                        {event.destination} · {event.destination_province}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {formatTime(event.start_datetime)} - {formatTime(event.end_datetime)} น. ·{' '}
                        {event.requester_name}
                      </p>
                    </div>
                    <StatusBadgeInline status={event.status} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                    <span className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                      🚐 {car ? `${car.license_plate} (${CAR_TYPE[car.car_type] || 'รถ'})` : 'ยังไม่ระบุรถ'}
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                      👥 {event.passenger_count} คน
                    </span>
                    <span className="rounded-lg bg-white px-2.5 py-1.5 ring-1 ring-slate-200">
                      📄 {event.doc_number}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
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
