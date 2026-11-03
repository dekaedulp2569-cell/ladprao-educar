import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { APPROVAL_TYPE, formatDate, formatTime } from '../lib/helpers'
import { Card, EmptyState, SectionTitle, Spinner, StatusBadge } from './ui'

export function MyRequests() {
  const { session } = useAuth()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data, error: loadError } = await supabase
        .from('car_requests')
        .select('*')
        .eq('requester_name', session?.name || '')
        .order('created_at', { ascending: false })

      if (loadError) setError('ไม่สามารถโหลดรายการคำขอได้')
      else setRequests(data || [])
      setLoading(false)
    }
    if (session?.name) load()
  }, [session?.name])

  const summary = useMemo(() => {
    return requests.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1
        return acc
      },
      { pending: 0, tentative: 0, approved: 0, rejected: 0 },
    )
  }, [requests])

  if (loading) return <Spinner label="กำลังโหลดคำขอของฉัน..." />

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium text-brand-700">ติดตามสถานะ</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-800 sm:text-3xl">คำขอใช้รถของฉัน</h1>
        <p className="mt-1 text-sm text-slate-500">
          แสดงรายการที่ลงชื่อผู้ขอเป็น {session?.name}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="รอตรวจสอบ" value={summary.pending} className="bg-brand-50 text-brand-800" />
        <SummaryCard label="รอ ผอ.เขต" value={summary.tentative} className="bg-amber-50 text-amber-700" />
        <SummaryCard label="อนุมัติแล้ว" value={summary.approved} className="bg-emerald-50 text-emerald-700" />
        <SummaryCard label="ไม่อนุมัติ" value={summary.rejected} className="bg-rose-50 text-rose-700" />
      </div>

      <Card className="p-4 sm:p-5">
        <SectionTitle title="รายการทั้งหมด" subtitle={`${requests.length} รายการ`} />
        {requests.length === 0 ? (
          <EmptyState
            title="ยังไม่มีคำขอใช้รถ"
            description="เมื่อยื่นคำขอแล้ว รายการและสถานะจะแสดงที่นี่"
          />
        ) : (
          <div className="space-y-3">
            {requests.map((request) => {
              const approval = APPROVAL_TYPE[request.approval_type] || APPROVAL_TYPE.head_of_dept
              return (
                <div key={request.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-slate-400">{request.doc_number}</p>
                      <p className="mt-0.5 text-sm font-semibold text-slate-800">{request.destination}</p>
                      <p className="text-xs text-slate-500">{request.destination_province}</p>
                    </div>
                    <StatusBadge status={request.status} />
                  </div>
                  <div className="mt-2 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                    <p>📅 {formatDate(request.start_datetime, true)}</p>
                    <p>⏰ ถึง {formatTime(request.end_datetime)} น.</p>
                    <p>👥 {request.passenger_count} คน</p>
                    <p>✍️ {approval.label} ({approval.line})</p>
                  </div>
                  {request.status === 'tentative' ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      อยู่ระหว่างรอ ผอ.เขตลาดพร้าว ลงนามอนุมัติหนังสือ
                    </p>
                  ) : null}
                  {request.status === 'approved' ? (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      อนุมัติเรียบร้อยและล็อกคิวรถแล้ว
                    </p>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </div>
  )
}

function SummaryCard({ label, value, className }) {
  return (
    <div className={`rounded-2xl p-4 ${className}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  )
}
