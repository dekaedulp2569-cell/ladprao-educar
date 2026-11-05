import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { APPROVAL_TYPE, STATUS, formatDate, formatDateTimeRange } from '../lib/helpers'
import { notifyLine } from '../lib/line'
import { Card, EmptyState, SectionTitle, Spinner, StatusBadge, StatusLegend } from './ui'
import { OfficialCarFormModal } from './OfficialCarFormModal'
import { openForm3PrintWindow } from '../lib/printForm3'

export function MyRequests() {
  const { session } = useAuth()
  const [requests, setRequests] = useState([])
  const [cars, setCars] = useState([])
  const [drivers, setDrivers] = useState([])
  const [printRequest, setPrintRequest] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [cancellingId, setCancellingId] = useState(null)

  const cancelApprovedRequest = async (request) => {
    const confirmed = window.confirm(
      `ยืนยันยกเลิกคำขอใช้รถเลขที่ ${request.doc_number || '-'} ที่ได้รับอนุมัติแล้วหรือไม่?\nระบบจะแจ้งผู้ขอ คนขับที่ได้รับมอบหมาย และกลุ่มฝ่ายการศึกษา`,
    )
    if (!confirmed) return

    setError('')
    setCancellingId(request.id)
    const { data: cancelledRequest, error: cancelError } = await supabase
      .from('car_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', request.id)
      .eq('requester_auth_user_id', session.userId)
      .eq('status', 'approved')
      .select('id')
      .maybeSingle()

    if (cancelError) {
      setError(`ยกเลิกคำขอไม่สำเร็จ: ${cancelError.message}`)
      setCancellingId(null)
      return
    }
    if (!cancelledRequest) {
      setError('ยกเลิกคำขอไม่สำเร็จ: รายการนี้ไม่อยู่ในสถานะอนุมัติแล้ว หรือบัญชีนี้ไม่มีสิทธิ์')
      setCancellingId(null)
      return
    }

    const cancelled = { ...request, status: 'cancelled' }
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? cancelled : item)),
    )
    setCancellingId(null)

    const notification = await notifyLine({ type: 'status', request: cancelled })
    if (notification?.ok === false || notification?.skipped) {
      setError('ยกเลิกคำขอแล้ว แต่ส่งการแจ้งเตือน LINE ไม่สำเร็จ กรุณาแจ้งกลุ่มฝ่ายด้วยตนเอง')
    }
  }

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [{ data: reqData, error: loadError }, { data: carData }, { data: driverData }] = await Promise.all([
        supabase
          .from('car_requests')
          .select('*')
          .eq('requester_auth_user_id', session?.userId || '')
          .order('created_at', { ascending: false }),
        supabase.from('cars').select('*'),
        supabase.from('drivers').select('id, full_name, nickname, dept, is_active, created_at'),
      ])

      if (loadError) setError('ไม่สามารถโหลดรายการคำขอได้')
      else {
        setRequests(reqData || [])
        setCars(carData || [])
        setDrivers(driverData || [])
      }
      setLoading(false)
    }
    if (session?.userId) load()
  }, [session?.userId])

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
          แสดงรายการคำขอที่ยื่นผ่านบัญชี {session?.name}
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label="รอตรวจสอบ" value={summary.pending} className={STATUS.pending.className} />
        <SummaryCard label="รอ ผอ.เขต" value={summary.tentative} className={STATUS.tentative.className} />
        <SummaryCard label="อนุมัติแล้ว" value={summary.approved} className={STATUS.approved.className} />
        <SummaryCard label="ไม่อนุมัติ" value={summary.rejected} className={STATUS.rejected.className} />
        <SummaryCard label="ยกเลิกแล้ว" value={summary.cancelled} className={STATUS.cancelled.className} />
      </div>

      <Card className="p-3">
        <p className="mb-2 text-xs font-semibold text-slate-500">ความหมายของสีสถานะ</p>
        <StatusLegend />
      </Card>

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
                    <p>📝 วันที่ยื่นคำขอ: {formatDate(request.request_date || request.created_at)}</p>
                    <p className="sm:col-span-2">📅 {formatDateTimeRange(request.start_datetime, request.end_datetime)}</p>
                    <p>👥 ผู้โดยสาร {request.passenger_count} คน</p>
                    <p>✍️ {approval.label} ({approval.line})</p>
                  </div>
                  {request.status === 'tentative' ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      อยู่ระหว่างรอ ผอ.เขตลาดพร้าว ลงนามอนุมัติหนังสือ
                    </p>
                  ) : null}
                  {request.status === 'approved' ? (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50 px-3 py-2">
                      <p className="text-xs text-emerald-700">อนุมัติเรียบร้อยและล็อกคิวรถแล้ว</p>
                      <button
                        type="button"
                        onClick={() => void cancelApprovedRequest(request)}
                        disabled={cancellingId === request.id}
                        className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
                      >
                        {cancellingId === request.id ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอ'}
                      </button>
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-400 font-mono">
                      {request.doc_number || '-'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const car = cars.find((c) => c.id === request.assigned_car_id)
                        const driver = drivers.find((d) => d.id === request.assigned_driver_id)
                        openForm3PrintWindow(request, car, driver)
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 transition hover:bg-brand-100"
                    >
                      📄 พิมพ์แบบ ๓ (A4)
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <OfficialCarFormModal
        open={Boolean(printRequest)}
        onClose={() => setPrintRequest(null)}
        request={printRequest?.request}
        car={printRequest?.car}
        driver={printRequest?.driver}
      />
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
