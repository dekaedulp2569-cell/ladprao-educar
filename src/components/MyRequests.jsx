import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { APPROVAL_TYPE, STATUS, carTypeDisplay, formatDate, formatDateTimeRange } from '../lib/helpers'
import { notifyLine } from '../lib/line'
import { Card, EmptyState, Modal, SectionTitle, Spinner, StatusBadge, StatusLegend } from './ui'
import { NotificationPopup } from './NotificationPopup'
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
  const [notice, setNotice] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  // คำขอที่ผู้ใช้กดยกเลิก — รอการยืนยันในหน้าต่าง Modal สวย ๆ (แทน window.confirm)
  // ไม่มีช่องเหตุผลตามข้อกำหนด (ไม่ต้องแตะ SQL)
  const [cancelTarget, setCancelTarget] = useState(null)

  const cancelApprovedRequest = async (request) => {
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
      setCancelTarget(null)
      return
    }
    if (!cancelledRequest) {
      setError('ยกเลิกคำขอไม่สำเร็จ: รายการนี้ไม่อยู่ในสถานะอนุมัติแล้ว หรือบัญชีนี้ไม่มีสิทธิ์')
      setCancellingId(null)
      setCancelTarget(null)
      return
    }

    const cancelled = { ...request, status: 'cancelled' }
    setRequests((current) =>
      current.map((item) => (item.id === request.id ? cancelled : item)),
    )
    setCancellingId(null)
    setCancelTarget(null)

    const notification = await notifyLine({ type: 'status', request: cancelled })
    if (notification?.ok === false || notification?.skipped) {
      setNotice('ยกเลิกคำขอแล้ว แต่ส่งการแจ้งเตือน LINE ไม่สำเร็จ กรุณาแจ้งกลุ่มฝ่ายด้วยตนเอง')
    } else {
      setNotice('ยกเลิกคำขอเรียบร้อยแล้ว และแจ้งเตือนทาง LINE แล้ว')
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
        // คนขับจากระบบรวม (view driver_directory = user_profiles role='driver')
        // สายเดียวกับที่หน้าแอดมินใช้ → ชื่อคนขับในเอกสาร แบบ ๓ ตรงกับที่แอดมินเห็น
        supabase.from('driver_directory').select('id, full_name, nickname'),
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

      <NotificationPopup open={Boolean(error)} message={error || ''} type="danger" onClose={() => setError('')} />
      <NotificationPopup open={Boolean(notice)} message={notice || ''} type="success" onClose={() => setNotice('')} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryCard label={`${STATUS.pending.emoji} ${STATUS.pending.short}`} value={summary.pending} className={STATUS.pending.className} />
        <SummaryCard label={`${STATUS.tentative.emoji} ${STATUS.tentative.short}`} value={summary.tentative} className={STATUS.tentative.className} />
        <SummaryCard label={`${STATUS.approved.emoji} ${STATUS.approved.short}`} value={summary.approved} className={STATUS.approved.className} />
        <SummaryCard label={`${STATUS.rejected.emoji} ${STATUS.rejected.short}`} value={summary.rejected} className={STATUS.rejected.className} />
        <SummaryCard label={`${STATUS.cancelled.emoji} ${STATUS.cancelled.short}`} value={summary.cancelled} className={STATUS.cancelled.className} />
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
              const car = cars.find((c) => c.id === request.assigned_car_id)
              const driver = drivers.find((d) => d.id === request.assigned_driver_id)
              const driverName = driver?.full_name || request.external_driver_name || ''
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
                  {/* แถบคนขับ + รถที่จัดสรร (ถ้ามี) — ให้ผู้ขอทราบว่าใครเป็นคนขับ */}
                  {driverName || car ? (
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-800">
                      {driverName ? <span>🧑‍✈️ คนขับ: {driverName}</span> : null}
                      {car ? (
                        <span className="text-blue-600">
                          🚐 {carTypeDisplay(car.car_type)} · {car.license_plate}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {/* แถบคำอธิบายครบทั้ง 5 สถานะ — สี/คำอธิบายสอดคล้องกับ STATUS กลาง */}
                  {request.status === 'pending' ? (
                    <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-700">
                      🔍 เจ้าหน้าที่กำลังตรวจสอบความถูกต้องของคำขอ — ตรวจสอบเสร็จจะแจ้งเตือนทาง LINE
                    </p>
                  ) : null}
                  {request.status === 'tentative' ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                      ⏳ อยู่ระหว่างรอ ผอ.เขตลาดพร้าว ลงนามอนุมัติหนังสือ
                    </p>
                  ) : null}
                  {request.status === 'approved' ? (
                    <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      ✅ อนุมัติเรียบร้อย — มีรถแน่นอนและล็อกคิวแล้ว
                    </p>
                  ) : null}
                  {request.status === 'rejected' ? (
                    <p className="mt-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      🔴 คำขอนี้ไม่ผ่านการอนุมัติ — สามารถยื่นคำขอใหม่ได้ตามขั้นตอน
                    </p>
                  ) : null}
                  {request.status === 'cancelled' ? (
                    <p className="mt-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      🚫 คำขอนี้ถูกยกเลิกแล้ว — ยื่นคำขอใหม่ได้ตลอดเวลา
                    </p>
                  ) : null}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-400 font-mono">
                      {request.doc_number || '-'}
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setPrintRequest({ request, car, driver })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-800"
                      >
                        📥 ดาวน์โหลด PDF
                      </button>
                      <button
                        type="button"
                        title="เปิดหน้าต่างพิมพ์ แบบ ๓ (A4) ในแท็บใหม่"
                        onClick={() => openForm3PrintWindow(request, car, driver)}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3.5 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-50"
                      >
                        🖨️ พิมพ์
                      </button>
                      {request.status === 'approved' ? (
                        <button
                          type="button"
                          onClick={() => setCancelTarget(request)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3.5 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50"
                        >
                          ✖ ยกเลิก
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* หน้าต่างยืนยันยกเลิกคำขอ — แทน window.confirm (ไม่มีช่องเหตุผล ไม่แตะ SQL) */}
      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => {
          if (!cancellingId) setCancelTarget(null)
        }}
        title="ยกเลิกคำขอใช้รถหรือไม่?"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setCancelTarget(null)}
              disabled={Boolean(cancellingId)}
              className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
            >
              ปล่อยไว้ก่อน
            </button>
            <button
              type="button"
              onClick={() => cancelTarget && void cancelApprovedRequest(cancelTarget)}
              disabled={Boolean(cancellingId)}
              className="flex-1 rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-60"
            >
              {cancellingId ? 'กำลังยกเลิก...' : 'ยืนยันยกเลิกคำขอ'}
            </button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-rose-100 text-lg">
              ✖️
            </span>
            <p className="text-sm leading-relaxed text-slate-600">
              เมื่อยกเลิกแล้ว คิวรถจะถูกปล่อยออกทันที และระบบแจ้งเตือนทาง LINE
              ถึงผู้ขอ คนขับที่ได้รับมอบหมาย และกลุ่มฝ่ายการศึกษา
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="font-mono text-xs text-slate-400">{cancelTarget?.doc_number || '-'}</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">📍 {cancelTarget?.destination}</p>
            <p className="mt-1 text-xs text-slate-500">
              📅 {formatDateTimeRange(cancelTarget?.start_datetime, cancelTarget?.end_datetime)}
            </p>
          </div>
        </div>
      </Modal>

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
