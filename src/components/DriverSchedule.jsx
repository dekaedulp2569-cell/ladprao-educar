import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import {
  CAR_TYPE,
  dateKey,
  formatDate,
  formatTime,
} from '../lib/helpers'
import { Card, EmptyState, SectionTitle, Spinner, StatusBadge } from './ui'

export function DriverSchedule() {
  const { session } = useAuth()
  const [requests, setRequests] = useState([])
  const [cars, setCars] = useState([])
  const [driverId, setDriverId] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError('')

      const driverResult = await supabase
        .from('drivers')
        .select('*')
        .eq('full_name', session?.name || '')
        .maybeSingle()

      const driver = driverResult.data
      setDriverId(driver?.id || null)

      let requestQuery = supabase
        .from('car_requests')
        .select('*')
        .order('start_datetime', { ascending: true })

      if (driver?.id) {
        requestQuery = requestQuery.eq('assigned_driver_id', driver.id)
      } else {
        requestQuery = requestQuery.ilike('external_driver_name', `%${session?.name || ''}%`)
      }

      const [requestResult, carResult] = await Promise.all([
        requestQuery,
        supabase.from('cars').select('*'),
      ])

      if (requestResult.error || carResult.error) {
        setError('ไม่สามารถโหลดตารางงานได้ กรุณาลองใหม่อีกครั้ง')
      } else {
        setRequests(requestResult.data || [])
        setCars(carResult.data || [])
      }
      setLoading(false)
    }

    if (session?.name) load()
  }, [session?.name])

  const todayKey = dateKey(new Date())

  const grouped = useMemo(() => {
    const today = []
    const upcoming = []
    const past = []
    requests.forEach((item) => {
      const key = dateKey(item.start_datetime)
      if (key === todayKey) today.push(item)
      else if (key > todayKey) upcoming.push(item)
      else past.push(item)
    })
    return { today, upcoming, past: past.reverse().slice(0, 10) }
  }, [requests, todayKey])

  if (loading) return <Spinner label="กำลังโหลดตารางงาน..." />

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-brand-700">ตารางงานพนักงานขับรถ</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-800 sm:text-3xl">งานของฉัน</h1>
        <p className="mt-1 text-sm text-slate-500">
          {session?.name}
          {driverId ? ' · ผูกบัญชีคนขับในระบบแล้ว' : ' · ยังไม่พบข้อมูลคนขับในระบบ (แสดงงานที่ระบุชื่อโดยตรง)'}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-100">
          <p className="text-xs text-brand-700">งานวันนี้</p>
          <p className="mt-1 text-2xl font-bold text-brand-800">{grouped.today.length}</p>
        </div>
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
          <p className="text-xs text-amber-700">งานที่กำลังจะมาถึง</p>
          <p className="mt-1 text-2xl font-bold text-amber-700">{grouped.upcoming.length}</p>
        </div>
        <div className="rounded-2xl bg-slate-100 p-4 ring-1 ring-slate-200">
          <p className="text-xs text-slate-600">งานที่ผ่านมา</p>
          <p className="mt-1 text-2xl font-bold text-slate-700">{grouped.past.length}</p>
        </div>
      </div>

      <JobSection title="งานวันนี้" subtitle={formatDate(new Date(), false)} jobs={grouped.today} cars={cars} emptyText="ไม่มีงานในวันนี้" />
      <JobSection title="งานที่กำลังจะมาถึง" jobs={grouped.upcoming} cars={cars} emptyText="ยังไม่มีงานที่ได้รับมอบหมายล่วงหน้า" />
      <JobSection title="งานที่ผ่านมา (10 รายการล่าสุด)" jobs={grouped.past} cars={cars} emptyText="ยังไม่มีประวัติงาน" muted />

      <Card className="p-4 text-xs leading-relaxed text-slate-500">
        <p className="font-medium text-slate-700">การแจ้งเตือน</p>
        <p className="mt-1">
          พนักงานขับรถฝ่ายการศึกษาจะได้รับข้อความ LINE ส่วนตัวเมื่อได้รับมอบหมายงาน
          และสรุปตารางงานประจำวันเวลา 16:30 น. ส่วนพนักงานขับรถฝ่ายอื่นจะได้รับข้อมูลผ่าน LINE กลุ่มกลางเท่านั้น
          (ต้องเปิดใช้งาน Supabase Edge Function และตั้งค่า LINE Channel Access Token ก่อน)
        </p>
      </Card>
    </div>
  )
}

function JobSection({ title, subtitle, jobs, cars, emptyText, muted }) {
  return (
    <Card className="p-4 sm:p-5">
      <SectionTitle title={title} subtitle={subtitle} />
      {jobs.length === 0 ? (
        <EmptyState title={emptyText} />
      ) : (
        <div className={muted ? 'space-y-2 opacity-75' : 'space-y-2'}>
          {jobs.map((job) => {
            const car = cars.find((item) => item.id === job.assigned_car_id)
            return (
              <div
                key={job.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-800">{job.destination}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {formatDate(job.start_datetime)} · {formatTime(job.start_datetime)} - {formatTime(job.end_datetime)} น.
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    🚐 {car ? `${car.license_plate} (${CAR_TYPE[car.car_type] || 'รถ'})` : job.external_car_info || 'ยังไม่ระบุรถ'} · 👤 {job.requester_name}
                  </p>
                </div>
                <StatusBadge status={job.status} />
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
