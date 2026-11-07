import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { buildStatusMessage, notifyLine } from '../lib/line'
import {
  APPROVAL_TYPE,
  CAR_TYPE,
  CAR_TYPE_OPTIONS,
  DOC_TYPE,
  STATUS,
  classNames,
  carTypeDisplay,
  currentFiscalYear,
  downloadCsv,
  fiscalYearOf,
  fiscalYearRange,
  formatDate,
  formatDateTimeRange,
  overlaps,
  toISO,
} from '../lib/helpers'
import { PROVINCES } from '../lib/provinces'
import { Alert, Card, EmptyState, Modal, SectionTitle, Spinner, StatusBadge, StatusLegend } from './ui'
import { NotificationPopup } from './NotificationPopup'
import { OfficialCarFormModal } from './OfficialCarFormModal'
import { RelatedPeoplePicker } from './RelatedPeoplePicker'
import { MembersPanel } from './MembersPanel'
import { LineGroupsPanel } from './LineGroupsPanel'
import { openForm3PrintWindow } from '../lib/printForm3'

const STATUS_TABS = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'pending', label: 'รอตรวจสอบ' },
  { value: 'tentative', label: 'รอ ผอ.เขต' },
  { value: 'approved', label: 'อนุมัติแล้ว' },
  { value: 'rejected', label: 'ไม่อนุมัติ' },
  { value: 'cancelled', label: 'ยกเลิกแล้ว' },
]

// 🔔 การแจ้งเตือนก่อนออกรถ — เลือกได้ต่องาน (ผูกกับคำขอด้วยฟิลด์ reminder_levels)
// ค่าเริ่มต้น = แจ้งครบทุกฉบับ (เหมือนระบบเดิม) งานประจำอาจเลือกแจ้งน้อยลง
const DEFAULT_REMINDER_LEVELS = ['60', '30', '10', 'passenger_10']

const REMINDER_LEVEL_OPTIONS = [
  { key: '60', label: '60 นาทีก่อนออกรถ', hint: 'เตรียมรถที่จุดรับ' },
  { key: '30', label: '30 นาทีก่อนออกรถ', hint: 'ไปรอที่จุดรับ' },
  { key: '10', label: '10 นาทีก่อนออกรถ', hint: 'รถพร้อมออก' },
  { key: 'passenger_10', label: 'แจ้งผู้เดินทาง 10 นาทีก่อนออก', hint: 'ส่วนตัวผู้ขอ/ผู้เกี่ยวข้อง' },
]

const REMINDER_PRESETS = [
  { key: 'important', label: '🚨 งานสำคัญ (แจ้งครบ)', levels: DEFAULT_REMINDER_LEVELS },
  { key: 'routine', label: '🔁 งานประจำ (เฉพาะ 30 นาที)', levels: ['30'] },
  { key: 'silent', label: '⊘ ไม่ต้องแจ้งเลย', levels: [] },
]

// 🚦 แจ้งเตือนการใช้งานซ้ำซ้อน: วันเดียวกัน เวลาทับกัน รถคันเดียวกัน/คนขับคนเดียวกัน
// เทียบกับงานที่จัดสรรไปแล้วทุกสถานะ (🟢 approved / 🟠 tentative / 🟡 pending) — ตัดงานไม่อนุมัติและยกเลิก
// จุดสลับกันพอดี (เช่น 08:00-10:00 กับ 10:00-12:00) ไม่นับว่าทับซ้อน
const CONFLICT_STATUSES = ['approved', 'tentative', 'pending']

const sameExternalText = (text, other) =>
  typeof text === 'string' &&
  typeof other === 'string' &&
  text.trim() !== '' &&
  text.trim() === other.trim()

function findAllocationConflicts(request, allocation, allRequests) {
  const start = new Date(request.start_datetime)
  const end = new Date(request.end_datetime)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return []

  const internalCar = allocation.carMode === 'internal' ? allocation.carId || null : null
  const externalCar = allocation.carMode === 'external' ? allocation.externalCar || '' : ''
  const internalDriver = allocation.driverMode === 'internal' ? allocation.driverId || null : null
  const externalDriver = allocation.driverMode === 'external' ? allocation.externalDriver || '' : ''
  if (!internalCar && !externalCar.trim() && !internalDriver && !externalDriver.trim()) return []

  const result = []
  for (const item of allRequests || []) {
    if (!item || item.id === request.id) continue
    if (!CONFLICT_STATUSES.includes(item.status)) continue
    const itemStart = new Date(item.start_datetime)
    const itemEnd = new Date(item.end_datetime)
    if (Number.isNaN(itemStart.getTime()) || Number.isNaN(itemEnd.getTime())) continue
    if (!overlaps(start, end, itemStart, itemEnd)) continue

    const carClash =
      (internalCar && item.assigned_car_id === internalCar) ||
      (externalCar.trim() !== '' && sameExternalText(item.external_car_info, externalCar))
    const driverClash =
      (internalDriver && item.assigned_driver_id === internalDriver) ||
      (externalDriver.trim() !== '' && sameExternalText(item.external_driver_name, externalDriver))
    if (carClash || driverClash) result.push({ item, carClash, driverClash })
  }
  return result.sort((a, b) => new Date(a.item.start_datetime) - new Date(b.item.start_datetime))
}

export function AdminDashboard() {
  const { session } = useAuth()
  const isAdmin = session?.role === 'admin'
  const isHeadOfDept = session?.role === 'head_of_dept'
  const [tab, setTab] = useState('requests')
  const [requests, setRequests] = useState([])
  const [cars, setCars] = useState([])
  const [drivers, setDrivers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [printRequest, setPrintRequest] = useState(null)
  const [editingRequest, setEditingRequest] = useState(null)
  const [lineNotifyBusyId, setLineNotifyBusyId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [summaryBusy, setSummaryBusy] = useState(false)

  const load = async () => {
    setLoading(true)
    setError('')
    const [requestResult, carResult, driverResult] = await Promise.all([
      supabase.from('car_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('cars').select('*').order('created_at', { ascending: true }),
      supabase.from('user_profiles').select('*').eq('role', 'driver').eq('status', 'active').order('full_name', { ascending: true }),
    ])

    if (requestResult.error || carResult.error || driverResult.error) {
      setError('ไม่สามารถโหลดข้อมูลได้ กรุณาตรวจสอบการเชื่อมต่อ Supabase')
    } else {
      setRequests(requestResult.data || [])
      setCars(carResult.data || [])
      setDrivers(driverResult.data || [])
      setSelected((current) => {
        if (!current) return current
        return (requestResult.data || []).find((item) => item.id === current.id) || null
      })
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const counts = useMemo(() => {
    return requests.reduce(
      (acc, item) => {
        acc[item.status] = (acc[item.status] || 0) + 1
        return acc
      },
      { pending: 0, tentative: 0, approved: 0, rejected: 0, cancelled: 0 },
    )
  }, [requests])

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    return requests.filter((item) => {
      const statusMatch = statusFilter === 'all' || item.status === statusFilter
      if (!statusMatch) return false
      if (!keyword) return true
      return [item.requester_name, item.doc_number, item.destination, item.requester_department]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(keyword))
    })
  }, [requests, statusFilter, search])

  const updateRequest = async (id, patch) => {
    setBusy(true)
    const { data: updatedRequest, error: updateError } = await supabase
      .from('car_requests')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    setBusy(false)
    if (updateError) {
      setError(`อัปเดตไม่สำเร็จ: ${updateError.message}`)
      return false
    }
    if (!updatedRequest) {
      setError('อัปเดตไม่สำเร็จ: บัญชีนี้ไม่มีสิทธิ์ดำเนินการกับคำขอนี้')
      return false
    }
    await load()
    return true
  }

  const notifyAssignedDriver = (request) => {
    if (!request.assigned_driver_id && !request.external_driver_name) return
    void notifyLine({ type: 'driver_assigned', request })
  }

  /**
   * 🟠/🟢 ส่งใบสั่งงานส่วนตัวคนขับตามสถานะปัจจุบันของคำขอ (เรียกหลังบันทึกการจัดสรร และหลังอนุมัติ)
   * คืนค่า: { result: 'skipped' | true | 'error', detail?: string }
   */
  const sendDriverMissionNotice = async (request) => {
    if (!isAdmin) return { result: 'skipped' }
    if (!request.assigned_driver_id && !request.external_driver_name) return { result: 'skipped' }
    const notification = await notifyLine({
      type: 'driver_assigned',
      request: { id: request.id },
    })
    if (notification?.result?.ok === true) return { result: true }
    const detail = notification?.reason || notification?.error || 'ส่งใบสั่งงานไม่สำเร็จ'
    return { result: 'error', detail }
  }

  const notifyRequestParties = async (request, successMessage = 'ส่งข้อความ LINE ให้ผู้เกี่ยวข้องแล้ว') => {
    setError('')
    setNotice('')
    setLineNotifyBusyId(request.id)
    const result = await notifyLine({ type: 'request_reminder', request: { id: request.id } })
    setLineNotifyBusyId(null)

    if (!result?.ok) {
      setError(
        `แจ้งเตือน LINE: ${
          result?.reason || 'ยังไม่ได้เชื่อมต่อ LINE'
        }`,
      )
      return false
    }

    if (result?.missingRecipients?.length > 0) {
      setNotice(
        `${successMessage} (หมายเหตุ: มีผู้ที่ยังไม่ได้รับ: ${result.missingRecipients.join(' · ')})`,
      )
    } else {
      setNotice(successMessage)
    }
    return true
  }

  const saveEditedRequest = async (request, values) => {
    if (!isAdmin || request.status === 'cancelled') {
      setError('เฉพาะ Admin สามารถแก้ไขคำขอที่ยังไม่ถูกยกเลิกได้')
      return
    }

    const patch = {
      request_date: values.request_date,
      doc_type: values.doc_type,
      doc_number: values.doc_number.trim(),
      requester_name: values.requester_name.trim(),
      requester_position: values.requester_position.trim(),
      requester_department: values.requester_department.trim(),
      phone: values.phone.trim() || null,
      destination: values.destination.trim(),
      destination_province: values.destination_province,
      start_datetime: toISO(values.start_datetime),
      end_datetime: toISO(values.end_datetime),
      passenger_count: Number(values.passenger_count),
      purpose: values.purpose.trim() || null,
      is_public_holiday: Boolean(values.is_public_holiday),
      related_line_user_ids: Array.isArray(values.related_line_user_ids)
        ? values.related_line_user_ids
        : [],
    }
    const saved = await updateRequest(request.id, patch)
    if (!saved) return

    setEditingRequest(null)
    const notified = await notifyRequestParties(
      request,
      'บันทึกการแก้ไขแล้ว และส่งข้อมูลล่าสุดให้ผู้ขอ คนขับ และกลุ่มฝ่ายทาง LINE แล้ว',
    )
    if (!notified) {
      setError((message) => `บันทึกการแก้ไขแล้ว แต่ ${message}`)
    }
  }

  const approve = async (request) => {
    const canApprove =
      isAdmin ||
      (isHeadOfDept && request.approval_type === 'head_of_dept' && request.status === 'pending')
    if (!canApprove) {
      setError('บัญชีนี้ไม่มีสิทธิ์อนุมัติคำขอนี้')
      return { saved: false, mission: 'skipped' }
    }

    if (request.status === 'tentative') {
      const ok = window.confirm(
        'ยืนยันว่า ผอ.เขตลาดพร้าว ลงนามอนุมัติหนังสือฉบับจริงแล้ว และต้องการเปลี่ยนสถานะเป็นอนุมัติ 100% หรือไม่',
      )
      if (!ok) return { saved: false, mission: 'skipped' }
      const saved = await updateRequest(request.id, {
        status: 'approved',
        director_approval_status: 'approved',
      })
      if (saved) {
        const approved = { ...request, status: 'approved' }
        void notifyLine({
          type: 'status',
          request: approved,
          statusLabel: 'อนุมัติแล้ว (ล็อกคิว)',
          text: buildStatusMessage(approved, 'อนุมัติแล้ว (ล็อกคิว)'),
        })
        // 🟢 ต่อจากแจ้งผู้ขอ/กลุ่ม: ตามด้วยใบสั่งงานฉบับเต็มถ้ามีการจัดสรรคนขับไว้แล้ว
        const mission = await sendDriverMissionNotice(approved)
        return { saved: true, mission }
      }
      return { saved: false, mission: 'skipped' }
    }

    if (request.status === 'pending') {
      const ok = window.confirm('ยืนยันการอนุมัติคำขอนี้ หรือไม่')
      if (!ok) return { saved: false, mission: 'skipped' }
      const saved = await updateRequest(request.id, { status: 'approved' })
      if (saved) {
        const approved = { ...request, status: 'approved' }
        void notifyLine({
          type: 'status',
          request: approved,
          statusLabel: 'อนุมัติแล้ว (ล็อกคิว)',
          text: buildStatusMessage(approved, 'อนุมัติแล้ว (ล็อกคิว)'),
        })
        // 🟢 ต่อจากแจ้งผู้ขอ/กลุ่ม: ตามด้วยใบสั่งงานฉบับเต็มถ้ามีการจัดสรรคนขับไว้แล้ว
        const mission = await sendDriverMissionNotice(approved)
        return { saved: true, mission }
      }
    }
    return { saved: false, mission: 'skipped' }
  }

  const reject = async (request) => {
    const canReject =
      isAdmin ||
      (isHeadOfDept && request.approval_type === 'head_of_dept' && request.status === 'pending')
    if (!canReject) {
      setError('บัญชีนี้ไม่มีสิทธิ์ไม่อนุมัติคำขอนี้')
      return
    }

    const ok = window.confirm('ยืนยันการไม่อนุมัติคำขอนี้หรือไม่')
    if (!ok) return
    const saved = await updateRequest(request.id, {
      status: 'rejected',
      director_approval_status: request.status === 'tentative' ? 'rejected' : request.director_approval_status,
    })
    if (saved) {
      const rejected = { ...request, status: 'rejected' }
      void notifyLine({
        type: 'status',
        request: rejected,
        statusLabel: 'ไม่อนุมัติ',
        text: buildStatusMessage(rejected, 'ไม่อนุมัติ'),
      })
    }
  }

  const cancelApprovedRequest = async (request) => {
    if (!isAdmin || request.status !== 'approved') {
      setError('เฉพาะ Admin สามารถยกเลิกคำขอที่อนุมัติแล้วได้')
      return
    }

    const confirmed = window.confirm(
      `ยืนยันยกเลิกคำขอใช้รถเลขที่ ${request.doc_number || '-'} ที่ได้รับอนุมัติแล้วหรือไม่?\nระบบจะแจ้งผู้ขอ คนขับที่ได้รับมอบหมาย และกลุ่มฝ่ายการศึกษา`,
    )
    if (!confirmed) return

    const saved = await updateRequest(request.id, { status: 'cancelled' })
    if (!saved) return

    const notification = await notifyLine({
      type: 'status',
      request: { ...request, status: 'cancelled' },
    })
    if (notification?.ok === false || notification?.skipped) {
      setError('ยกเลิกคำขอแล้ว แต่ส่งการแจ้งเตือน LINE ไม่สำเร็จ กรุณาแจ้งกลุ่มฝ่ายด้วยตนเอง')
    }
  }

const saveAllocation = async (request, allocation) => {
  if (!isAdmin) {
    setError('เฉพาะผู้ดูแลระบบเท่านั้นที่จัดสรรรถและพนักงานขับรถได้')
    return false
  }

  const internalCar = allocation.carMode === 'internal' ? allocation.carId || null : null
  const internalDriver = allocation.driverMode === 'internal' ? allocation.driverId || null : null

  // 🚦 การเตือนการใช้งานซ้ำซ้อนทำที่หน้าจัดสรร (แผงความพร้อมการจัดสรร + ยืนยันภายในหน้าต่าง)
  // ก่อนเรียกฟังก์ชันนี้แล้ว — ที่นี่บันทึกตามที่ผู้ใช้ยืนยันเรียบร้อย

  // อัปเดตเฉพาะฟิลด์จัดสรร (ไม่แตะ status) + ตั้งค่าการแจ้งเตือนก่อนออกรถของงานนี้
  const reminderLevels = DEFAULT_REMINDER_LEVELS.filter((level) =>
    allocation.reminderLevels.includes(level),
  )
  const saved = await updateRequest(request.id, {
    assigned_car_id: internalCar,
    external_car_info: allocation.carMode === 'external' ? allocation.externalCar.trim() || null : null,
    assigned_driver_id: internalDriver,
    external_driver_name:
      allocation.driverMode === 'external' ? allocation.externalDriver.trim() || null : null,
    reminder_levels: reminderLevels,
  })

  return saved
}

  const sendDailySummary = async () => {
    setSummaryBusy(true)
    setError('')
    try {
      const { data, error: summaryError } = await supabase.functions.invoke('daily-summary', {
        body: {},
      })
      if (summaryError) {
        setError(`ส่งสรุปตารางรถไม่สำเร็จ: ${summaryError.message}`)
      } else {
        window.alert(`ส่งสรุปตารางรถของวันพรุ่งนี้แล้ว (${data?.jobs ?? 0} รายการ)`)
      }
    } catch (summaryError) {
      setError(
        `ส่งสรุปตารางรถไม่สำเร็จ: ${
          summaryError instanceof Error ? summaryError.message : 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ'
        }`,
      )
    } finally {
      setSummaryBusy(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-brand-700">สำหรับเจ้าหน้าที่ผู้จัดการรถ</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-800 sm:text-3xl">แดชบอร์ดจัดการคำขอใช้รถ</h1>
          <p className="mt-1 text-sm text-slate-500">
            ผู้ใช้งาน: {session?.name} · {session?.position}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isAdmin ? (
            <button
              type="button"
              onClick={sendDailySummary}
              disabled={summaryBusy}
              className="rounded-xl border border-brand-300 bg-brand-50 px-4 py-2.5 text-sm font-medium text-brand-800 transition hover:bg-brand-100 disabled:opacity-60"
            >
              {summaryBusy ? 'กำลังส่งสรุป...' : 'ส่งสรุปงานวันพรุ่งนี้'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={load}
            className="rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
          >
            ↻ รีเฟรชข้อมูล
          </button>
        </div>
      </div>

      <NotificationPopup open={Boolean(error)} message={error || ''} type="danger" onClose={() => setError('')} />
      <NotificationPopup open={Boolean(notice)} message={notice || ''} type="success" onClose={() => setNotice('')} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="รอตรวจสอบ" value={counts.pending} tone="sky" />
        <StatCard label="รอ ผอ.เขต อนุมัติ" value={counts.tentative} tone="amber" />
        <StatCard label="อนุมัติแล้ว" value={counts.approved} tone="emerald" />
        <StatCard label="ไม่อนุมัติ" value={counts.rejected} tone="rose" />
        <StatCard label="ยกเลิกแล้ว" value={counts.cancelled} tone="slate" />
      </div>

      <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-1.5">
        {[
          { value: 'requests', label: 'คำขอใช้รถ' },
          ...(isAdmin
            ? [
                { value: 'resources', label: 'รถและคนขับ' },
                { value: 'members', label: 'จัดการสมาชิก' },
                { value: 'lineGroups', label: 'กลุ่ม LINE' },
                { value: 'reports', label: 'รายงานและจัดการข้อมูล' },
              ]
            : []),
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setTab(item.value)}
            className={classNames(
              'rounded-xl px-4 py-2 text-sm font-medium transition',
              tab === item.value
                ? 'bg-brand-700 text-white shadow-sm'
                : 'text-slate-600 hover:bg-brand-50',
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Spinner />
      ) : tab === 'requests' ? (
        <>
          <Card className="p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {STATUS_TABS.map((item) => {
                  const count = item.value === 'all' ? requests.length : counts[item.value] || 0
                  return (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setStatusFilter(item.value)}
                      className={classNames(
                        'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition',
                        statusFilter === item.value
                          ? 'bg-brand-700 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-brand-50',
                      )}
                    >
                      {item.label} ({count})
                    </button>
                  )
                })}
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหาชื่อผู้ขอ เลขที่เอกสาร หรือปลายทาง"
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 lg:max-w-sm"
              />
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-600">สีสถานะในระบบ</p>
              <p className="text-[11px] text-slate-400">ใช้สีเดียวกันกับข้อความแจ้งเตือนใน LINE</p>
            </div>
            <StatusLegend />
          </div>

          {filtered.length === 0 ? (
            <EmptyState title="ไม่พบรายการคำขอ" description="ลองเปลี่ยนตัวกรองสถานะหรือคำค้นหา" />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
              <table className="min-w-[1100px] w-full divide-y divide-slate-200 text-left text-sm">
                <thead className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">เลขที่ / วันที่ยื่น</th>
                    <th className="px-4 py-3">ผู้ขอ / สังกัด</th>
                    <th className="px-4 py-3">ปลายทาง / วันเวลา</th>
                    <th className="px-4 py-3">รถ / คนขับ</th>
                    <th className="px-4 py-3">สถานะ</th>
                    <th className="px-4 py-3">จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((request) => {
                    const car = cars.find((item) => item.id === request.assigned_car_id)
                    const driver = drivers.find((item) => item.id === request.assigned_driver_id)
                    return (
                      <tr key={request.id} className="align-top hover:bg-slate-50/70">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-slate-800">{request.doc_number || '-'}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            ยื่น {formatDate(request.request_date || request.created_at)}
                          </p>
                        </td>
                        <td className="max-w-56 px-4 py-3">
                          <p className="font-medium text-slate-800">{request.requester_name || '-'}</p>
                          <p className="mt-1 text-xs text-slate-500">{request.requester_department || '-'}</p>
                        </td>
                        <td className="max-w-64 px-4 py-3">
                          <p className="font-medium text-slate-800">
                            {request.destination || '-'} · {request.destination_province || '-'}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {formatDateTimeRange(request.start_datetime, request.end_datetime)}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600">
                          <p>{car ? `${car.license_plate} (${carTypeDisplay(car.car_type)})` : request.external_car_info || 'ยังไม่จัดสรรรถ'}</p>
                          <p className="mt-1">{driver?.full_name || request.external_driver_name || 'ยังไม่จัดสรรคนขับ'}</p>
                        </td>
                        <td className="px-4 py-3"><StatusBadge status={request.status} /></td>
                        <td className="px-4 py-3">
                          <div className="flex min-w-56 flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => setSelected(request)}
                              className="rounded-lg bg-brand-700 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-800"
                            >
                              ดู / จัดการ
                            </button>
                            {isAdmin && request.status !== 'cancelled' ? (
                              <button
                                type="button"
                                onClick={() => setEditingRequest(request)}
                                className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                              >
                                แก้ไข
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => openForm3PrintWindow(request, car, driver)}
                              className="rounded-lg border border-brand-200 px-2.5 py-1.5 text-xs font-semibold text-brand-800 hover:bg-brand-50"
                            >
                              พิมพ์แบบ ๓
                            </button>
                            {isAdmin ? (
                              <button
                                type="button"
                                onClick={() => void notifyRequestParties(request)}
                                disabled={lineNotifyBusyId === request.id}
                                className="rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-60"
                              >
                                {lineNotifyBusyId === request.id ? 'กำลังส่ง...' : 'แจ้ง LINE'}
                              </button>
                            ) : null}
                            {isAdmin && request.status === 'approved' ? (
                              <button
                                type="button"
                                onClick={() => void cancelApprovedRequest(request)}
                                disabled={busy}
                                className="rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                              >
                                ยกเลิก
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : tab === 'resources' ? (
        <ResourcesPanel
          cars={cars}
          drivers={drivers}
          onReload={load}
          onError={setError}
        />
      ) : tab === 'members' ? (
        <MembersPanel onError={setError} />
      ) : tab === 'lineGroups' ? (
        <LineGroupsPanel onError={setError} />
      ) : (
        <ReportsPanel
          requests={requests}
          cars={cars}
          drivers={drivers}
          onReload={load}
          onError={setError}
        />
      )}

      <RequestDetail
        request={selected}
        cars={cars}
        drivers={drivers}
        allRequests={requests}
        busy={busy}
        onClose={() => setSelected(null)}
        onApprove={approve}
        onReject={reject}
        onCancel={cancelApprovedRequest}
        onSaveAllocation={saveAllocation}
        onSendDriverMission={sendDriverMissionNotice}
        canManageAllocation={isAdmin && selected?.status !== 'cancelled'}
        canCancelRequest={isAdmin}
        canReviewRequest={
          isAdmin ||
          (isHeadOfDept &&
            selected?.approval_type === 'head_of_dept' &&
            selected?.status === 'pending')
        }
        onPrint={(req) => {
          const car = cars.find((c) => c.id === req.assigned_car_id)
          const driver = drivers.find((d) => d.id === req.assigned_driver_id)
          openForm3PrintWindow(req, car, driver)
        }}
      />

      {editingRequest ? (
        <RequestEditModal
          key={editingRequest.id}
          request={editingRequest}
          busy={busy}
          onClose={() => setEditingRequest(null)}
          onSave={saveEditedRequest}
        />
      ) : null}

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

function StatCard({ label, value, tone }) {
  const tones = {
    brand: 'bg-brand-50 text-brand-800 ring-brand-100',
    sky: 'bg-sky-50 text-sky-700 ring-sky-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-100',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  }
  return (
    <div className={classNames('rounded-2xl p-4 ring-1', tones[tone])}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      <p className="mt-1 text-2xl font-bold sm:text-3xl">{value}</p>
    </div>
  )
}

function dateTimeLocalValue(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
}

function RequestEditModal({ request, busy, onClose, onSave }) {
  const [values, setValues] = useState(() => ({
    request_date: request.request_date || '',
    doc_type: request.doc_type || 'school_letter',
    doc_number: request.doc_number || '',
    requester_name: request.requester_name || '',
    requester_position: request.requester_position || '',
    requester_department: request.requester_department || '',
    phone: request.phone || '',
    destination: request.destination || '',
    destination_province: request.destination_province || 'กรุงเทพมหานคร',
    start_datetime: dateTimeLocalValue(request.start_datetime),
    end_datetime: dateTimeLocalValue(request.end_datetime),
    passenger_count: request.passenger_count || 1,
    purpose: request.purpose || '',
    is_public_holiday: Boolean(request.is_public_holiday),
    related_line_user_ids: Array.isArray(request.related_line_user_ids)
      ? request.related_line_user_ids
      : [],
  }))
  const [validationError, setValidationError] = useState('')

  const update = (field, value) => {
    setValues((current) => ({ ...current, [field]: value }))
  }
  const save = async (event) => {
    event.preventDefault()
    setValidationError('')
    if (new Date(values.end_datetime) <= new Date(values.start_datetime)) {
      setValidationError('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น')
      return
    }
    if (Number(values.passenger_count) < 1) {
      setValidationError('จำนวนผู้โดยสารต้องอย่างน้อย 1 คน')
      return
    }
    await onSave(request, values)
  }

  return (
    <Modal open={Boolean(request)} onClose={onClose} title="แก้ไขคำขอใช้รถ" size="lg">
      <form onSubmit={save} className="space-y-4">
        {request.status === 'approved' ? (
          <Alert tone="warning">
            หากแก้วันเวลา จังหวัดปลายทาง หรือวันหยุด ระบบจะคำนวณเส้นทางอนุมัติใหม่
            เปลี่ยนกลับเป็นรออนุมัติ และล้างรถ/คนขับที่จัดสรรไว้
          </Alert>
        ) : null}
        {validationError ? <Alert tone="danger">{validationError}</Alert> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium text-slate-600">
            ประเภทเอกสาร
            <select
              value={values.doc_type}
              onChange={(event) => update('doc_type', event.target.value)}
              className={selectClass}
            >
              <option value="school_letter">{DOC_TYPE.school_letter}</option>
              <option value="dept_form">{DOC_TYPE.dept_form}</option>
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            เลขที่เอกสาร
            <input required value={values.doc_number} onChange={(event) => update('doc_number', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            วันที่ยื่นคำขอ
            <input required type="date" value={values.request_date} onChange={(event) => update('request_date', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            ชื่อผู้ขอ
            <input required value={values.requester_name} onChange={(event) => update('requester_name', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            ตำแหน่ง
            <input required value={values.requester_position} onChange={(event) => update('requester_position', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            สังกัด
            <input required value={values.requester_department} onChange={(event) => update('requester_department', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            โทรศัพท์
            <input value={values.phone} onChange={(event) => update('phone', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            สถานที่ปลายทาง
            <input required value={values.destination} onChange={(event) => update('destination', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            จังหวัด
            <select
              value={values.destination_province}
              onChange={(event) => update('destination_province', event.target.value)}
              className={selectClass}
            >
              {PROVINCES.map((province) => <option key={province} value={province}>{province}</option>)}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            วันเวลาเริ่มต้น
            <input required type="datetime-local" value={values.start_datetime} onChange={(event) => update('start_datetime', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            วันเวลาสิ้นสุด
            <input required type="datetime-local" value={values.end_datetime} onChange={(event) => update('end_datetime', event.target.value)} className={selectClass} />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600">
            จำนวนผู้โดยสาร
            <input required min="1" type="number" value={values.passenger_count} onChange={(event) => update('passenger_count', event.target.value)} className={selectClass} />
          </label>
          <label className="flex items-center gap-2 self-end rounded-xl border border-slate-200 px-3 py-3 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={values.is_public_holiday}
              onChange={(event) => update('is_public_holiday', event.target.checked)}
            />
            วันหยุดนักขัตฤกษ์
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-600 sm:col-span-2">
            วัตถุประสงค์
            <textarea value={values.purpose} onChange={(event) => update('purpose', event.target.value)} rows="3" className={selectClass} />
          </label>
        </div>

        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-700">ผู้ที่เกี่ยวข้อง (รับแจ้งเตือน LINE)</p>
          <RelatedPeoplePicker
            value={values.related_line_user_ids}
            onChange={(next) => update('related_line_user_ids', next)}
          />
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            ปิด
          </button>
          <button type="submit" disabled={busy} className="rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:opacity-60">
            {busy ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function RequestDetail({
  request,
  cars,
  drivers,
  allRequests,
  busy,
  onClose,
  onApprove,
  onReject,
  onCancel,
  onSaveAllocation,
  onSendDriverMission,
  canManageAllocation,
  canCancelRequest,
  canReviewRequest,
  onPrint,
}) {
  const [allocation, setAllocation] = useState({
    carMode: 'internal',
    carId: '',
    externalCar: '',
    driverMode: 'internal',
    driverId: '',
    externalDriver: '',
    reminderLevels: DEFAULT_REMINDER_LEVELS,
  })
  // แถบสถานะภายในหน้าต่าง: { tone: 'amber' | 'green', text, sub? }
  // จะแสดงหลังบันทึกการจัดสรร / หลังอนุมัติ — หน้าต่างไม่ปิดเอง ให้ผู้ใช้กดปิดเอง
  const [allocationStatus, setAllocationStatus] = useState(null)
  const [approveStatus, setApproveStatus] = useState(null)
  // 🚦 แถบยืนยันกรณีจัดสรรทับกับงานเดิม — ยืนยันภายในหน้าต่างเดิม (แทน window.confirm)
  const [overlapConfirm, setOverlapConfirm] = useState(false)

  useEffect(() => {
    if (!request) return
    setAllocation({
      carMode: request.external_car_info ? 'external' : 'internal',
      carId: request.assigned_car_id || '',
      externalCar: request.external_car_info || '',
      driverMode: request.external_driver_name ? 'external' : 'internal',
      driverId: request.assigned_driver_id || '',
      externalDriver: request.external_driver_name || '',
      reminderLevels:
        Array.isArray(request.reminder_levels) && request.reminder_levels.length
          ? request.reminder_levels
          : DEFAULT_REMINDER_LEVELS,
    })
    setAllocationStatus(null)
    setApproveStatus(null)
  }, [request])

  // เมื่อแก้การจัดสรร (เลือกรถ/คนขับใหม่) ปิดแถบยืนยันเดิมทันที — กดบันทึกอีกครั้งจะตรวจใหม่
  useEffect(() => {
    setOverlapConfirm(false)
  }, [allocation])

  if (!request) return null

  const approval = APPROVAL_TYPE[request.approval_type] || APPROVAL_TYPE.head_of_dept
  const car = cars.find((item) => item.id === request.assigned_car_id)
  const driver = drivers.find((item) => item.id === request.assigned_driver_id)

  // 🔔 ตั้งค่าการแจ้งเตือนต่องาน: preset ที่ตรงกับช่องติ๊กปัจจุบัน + เวลาที่จะส่งของแต่ละฉบับ
  const activePresetKey = REMINDER_PRESETS.find(
    (preset) =>
      preset.levels.length === allocation.reminderLevels.length &&
      preset.levels.every((level) => allocation.reminderLevels.includes(level)),
  )?.key

  const departure = new Date(request.start_datetime)
  const reminderTimeText = (minutes) => {
    if (Number.isNaN(departure.getTime())) return ''
    const time = new Date(departure.getTime() - minutes * 60_000)
    return ` (ส่ง ${String(time.getHours()).padStart(2, '0')}:${String(time.getMinutes()).padStart(2, '0')} น.)`
  }
  const selectedReminderLabels = REMINDER_LEVEL_OPTIONS.filter((option) =>
    allocation.reminderLevels.includes(option.key),
  ).map((option) => option.label)
  const reminderSummaryText = allocation.reminderLevels.length
    ? `งานนี้จะส่งแจ้งเตือน ${allocation.reminderLevels.length} ฉบับ: ${selectedReminderLabels.join(' · ')}`
    : 'งานนี้ไม่ส่งแจ้งซ้ำก่อนออกรถ (คนขับยังได้ใบสั่งงานตอนอนุมัติ + สรุปประจำวันตามปกติ)'

  // 🚦 ตรวจสดการใช้งานซ้ำซ้อน: รถ/คนขับที่เลือก เทียบกับงานทุกสถานะที่จัดสรรไว้แล้ว (ช่วงเวลาทับกัน)
  // เรียกตรง (ไม่ใช้ useMemo) — hook ห้ามอยู่หลัง early return ของ component
  const allocationConflicts = findAllocationConflicts(request, allocation, allRequests)
  const carConflicts = allocationConflicts.filter((entry) => entry.carClash)
  const driverConflicts = allocationConflicts.filter((entry) => entry.driverClash)

  const chosenCar = allocation.carMode === 'internal' ? cars.find((item) => item.id === allocation.carId) : null
  const chosenCarSet = allocation.carMode === 'external' ? allocation.externalCar.trim() !== '' : Boolean(chosenCar)
  const chosenCarLabel = allocation.carMode === 'internal'
    ? chosenCar
      ? `${chosenCar.license_plate} (${carTypeDisplay(chosenCar.car_type)})`
      : ''
    : allocation.externalCar.trim()
  const chosenDriver = allocation.driverMode === 'internal'
    ? drivers.find((item) => item.id === allocation.driverId)
    : null
  const chosenDriverSet =
    allocation.driverMode === 'external' ? allocation.externalDriver.trim() !== '' : Boolean(chosenDriver)
  const chosenDriverLabel = allocation.driverMode === 'internal'
    ? chosenDriver
      ? `${chosenDriver.nickname ? `${chosenDriver.nickname} - ` : ''}${chosenDriver.full_name}`
      : ''
    : allocation.externalDriver.trim()

  const submitAllocation = async (force = false) => {
    setAllocationStatus(null)
    // 🚦 พบการทับซ้อน → ให้ยืนยันภายในหน้าต่างก่อน จึงบันทึกกระทบงานเดิมได้
    if (allocationConflicts.length > 0 && !force) {
      setOverlapConfirm(true)
      return
    }
    setOverlapConfirm(false)
    const saved = await onSaveAllocation(request, allocation)
    if (!saved) return
    const driverAllocated = allocation.driverMode === 'internal'
      ? Boolean(allocation.driverId)
      : Boolean(allocation.externalDriver.trim())
    if (!driverAllocated) {
      setAllocationStatus({
        tone: 'amber',
        text: '✅ บันทึกการจัดสรรแล้ว (ยังไม่ได้จัดสรรคนขับ)',
        sub: 'ใบสั่งงานจะส่งให้คนขับเมื่อจัดสรรคนขับเรียบร้อย • หน้าต่างยังเปิดอยู่ — กดปิดเมื่อพร้อม',
      })
      return
    }

    // ส่งใบสั่งงานให้คนขับตามสถานะ: approved → 🟢 ฉบับทางการ / pending-tentative → 🟠 ล่วงหน้า
    const mission = await onSendDriverMission(request)
    const approved = request.status === 'approved'
    if (mission?.result === true) {
      setAllocationStatus({
        tone: approved ? 'green' : 'amber',
        text: approved
          ? '✅ บันทึกการจัดสรรแล้ว • ส่งใบสั่งงาน 🟢 ให้คนขับแล้ว'
          : '✅ บันทึกการจัดสรรแล้ว • ส่งใบสั่งงานล่วงหน้า 🟠 ให้คนขับแล้ว (ยังไม่อนุมัติ)',
        sub: approved
          ? 'หน้าต่างยังเปิดอยู่ — กดปิดเมื่อพร้อม'
          : 'กด "อนุมัติคำขอ / ล็อกคิว" เพื่อล็อกคิวและส่งใบสั่งงานฉบับทางการ 🟢 ต่อได้เลย • หน้าต่างยังเปิดอยู่',
      })
    } else {
      setAllocationStatus({
        tone: 'amber',
        text: 'บันทึกการจัดสรรแล้ว แต่ส่งใบสั่งงานให้คนขับไม่สำเร็จ',
        sub: `${mission?.detail || ''} • กด "บันทึกการจัดสรร" ซ้ำเพื่อส่งอีกครั้งได้`,
      })
    }
  }

const handleApprove = async () => {
  setApproveStatus(null)
  // อนุมัติสถานะ (ไม่แตะรถ/คนขับ) — หากมีคนขับที่จัดสรรแล้ว ระบบจะส่งใบสั่งงาน 🟢 ให้คนขับตามอัตโนมัติ
  const outcome = await onApprove(request)
  if (!outcome?.saved) return
  if (outcome.mission === true) {
    setApproveStatus({
      tone: 'green',
      text: '✅ อนุมัติแล้ว (ล็อกคิว) • แจ้งผู้ขอ/กลุ่ม + ส่งใบสั่งงาน 🟢 ให้คนขับแล้ว',
      sub: 'หน้าต่างยังเปิดอยู่ — กดปิดเมื่อพร้อม',
    })
  } else if (outcome.mission === 'error') {
    setApproveStatus({
      tone: 'amber',
      text: 'อนุมัติแล้ว (ล็อกคิว) แต่ส่งใบสั่งงาน 🟢 ไม่สำเร็จ',
      sub: `${outcome.detail || ''} • บันทึกการจัดสรรซ้ำเพื่อส่งใบสั่งงานอีกครั้งได้`,
    })
  } else {
    setApproveStatus({
      tone: 'green',
      text: '✅ อนุมัติแล้ว (ล็อกคิว) • แจ้งผู้ขอและกลุ่มฝ่ายแล้ว',
      sub: 'ยังไม่มีคนขับที่จัดสรร — บันทึกการจัดสรรในหน้าต่างนี้เพื่อส่งใบสั่งงาน 🟢 ให้คนขับ • หน้าต่างยังเปิดอยู่',
    })
  }
}

  return (
    <Modal open={Boolean(request)} onClose={onClose} title="รายละเอียดคำขอใช้รถ" size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <p className="text-xs text-slate-400 font-mono">{request.doc_number}</p>
            <h3 className="text-lg font-bold text-slate-800">{request.destination}</h3>
            <p className="text-sm text-slate-500">{request.destination_province}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPrint(request)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-brand-300 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-800 transition hover:bg-brand-100"
            >
              📄 พิมพ์แบบ ๓ (A4)
            </button>
            <StatusBadge status={request.status} />
          </div>
        </div>

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <Info label="ผู้ขอใช้รถ" value={request.requester_name} />
          <Info label="ตำแหน่ง" value={request.requester_position} />
          <Info label="สังกัด" value={request.requester_department} />
          <Info label="โทรศัพท์" value={request.phone || '-'} />
          <Info label="วันที่ยื่นคำขอ" value={formatDate(request.request_date || request.created_at)} />
          <Info label="วันเวลาเริ่มต้น" value={formatDate(request.start_datetime, true)} />
          <Info label="วันเวลาสิ้นสุด" value={formatDate(request.end_datetime, true)} />
          <Info
            label="เงื่อนไขการเดินทาง"
            value={[
              request.is_out_of_bkk ? 'นอก กทม.' : null,
              request.is_out_of_hours ? 'นอกเวลา' : null,
              request.is_weekend ? 'เสาร์-อาทิตย์' : null,
              request.is_public_holiday ? 'วันหยุดนักขัตฤกษ์' : null,
            ].filter(Boolean).join(' · ') || 'วันทำการ / ในเวลาราชการ'}
            className="sm:col-span-2"
          />
          <Info label="จำนวนผู้โดยสาร" value={`${request.passenger_count} คน`} />
          <Info label="ประเภทเอกสาร" value={DOC_TYPE[request.doc_type] || '-'} />
          <Info label="วัตถุประสงค์" value={request.purpose || '-'} className="sm:col-span-2" />
        </div>

        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">เส้นทางอนุมัติ</p>
          <p className="mt-1 text-sm font-semibold text-slate-800">
            {approval.document} → {approval.label}
          </p>
          <p className="text-xs text-slate-600">{approval.line}</p>
          {request.status === 'tentative' ? (
            <p className="mt-2 text-xs text-amber-700">
              ต้องได้รับหนังสือลงนามจาก ผอ.เขตลาดพร้าว ก่อนเจ้าหน้าที่จึงจะเปลี่ยนสถานะเป็นอนุมัติ 100%
            </p>
          ) : null}
        </div>

        {canManageAllocation ? <div>
          <h4 className="mb-2 text-sm font-semibold text-slate-800">การจัดสรรทรัพยากร</h4>
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">รถที่ใช้</p>
              <div className="mb-2 flex gap-3 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={allocation.carMode === 'internal'}
                    onChange={() => setAllocation({ ...allocation, carMode: 'internal' })}
                  />
                  รถในระบบ
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={allocation.carMode === 'external'}
                    onChange={() => setAllocation({ ...allocation, carMode: 'external' })}
                  />
                  รถไม่มีในระบบ (กรอกเอง)
                </label>
              </div>
              {allocation.carMode === 'internal' ? (
                <select
                  value={allocation.carId}
                  onChange={(event) => setAllocation({ ...allocation, carId: event.target.value })}
                  className={selectClass}
                >
                  <option value="">-- เลือกรถ --</option>
                  {cars.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.license_plate} · {carTypeDisplay(item.car_type) || 'รถ'} · {item.province}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  value={allocation.externalCar}
                  onChange={(event) => setAllocation({ ...allocation, externalCar: event.target.value })}
                  placeholder="ระบุรถที่ไม่มีในระบบ เช่น รถตู้ยืมจากหน่วยงานอื่น ทะเบียน 1กข 1234"
                  className={selectClass}
                />
              )}
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-slate-600">พนักงานขับรถ</p>
              <div className="mb-2 flex gap-3 text-sm">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={allocation.driverMode === 'internal'}
                    onChange={() => setAllocation({ ...allocation, driverMode: 'internal' })}
                  />
                  คนขับในระบบ
                </label>
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="radio"
                    checked={allocation.driverMode === 'external'}
                    onChange={() => setAllocation({ ...allocation, driverMode: 'external' })}
                  />
                  คนขับไม่มีในระบบ (กรอกเอง)
                </label>
              </div>
              {allocation.driverMode === 'internal' ? (
                <select
                  value={allocation.driverId}
                  onChange={(event) => setAllocation({ ...allocation, driverId: event.target.value })}
                  className={selectClass}
                >
                  <option value="">-- เลือกพนักงานขับรถ --</option>
                  {/* กลุ่มที่ 1: ฝ่ายการศึกษา (แสดงก่อน) */}
                  {drivers
                    .filter((d) => d.driver_dept_type === 'education')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {(item.nickname ? item.nickname + ' - ' : '') + item.full_name} ({item.phone || 'ไม่มีเบอร์'})
                      </option>
                    ))}
                  <option disabled className="text-slate-400">───── ฝ่ายอื่น / สำนักงานเขต ─────</option>
                  {/* กลุ่มที่ 2: ฝ่ายอื่น */}
                  {drivers
                    .filter((d) => d.driver_dept_type === 'other')
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {(item.nickname ? item.nickname + ' - ' : '') + item.full_name} ({item.phone || 'ไม่มีเบอร์'})
                      </option>
                    ))}
                </select>
              ) : (
                <input
                  value={allocation.externalDriver}
                  onChange={(event) => setAllocation({ ...allocation, externalDriver: event.target.value })}
                  placeholder="ระบุชื่อพนักงานขับรถที่ไม่มีในระบบ"
                  className={selectClass}
                />
              )}
            </div>

            {/* 🚦 ความพร้อมการจัดสรร — ตรวจสดการใช้งานซ้ำซ้อน (วันเดียวกัน เวลาทับกัน รถ/คนขับเดียวกัน) */}
            <div
              className={classNames(
                'rounded-xl border p-3',
                allocationConflicts.length
                  ? 'border-rose-200 bg-rose-50/60'
                  : 'border-emerald-200 bg-emerald-50/60',
              )}
            >
              <p
                className={classNames(
                  'text-xs font-bold',
                  allocationConflicts.length ? 'text-rose-800' : 'text-emerald-800',
                )}
              >
                {allocationConflicts.length
                  ? `🚦 ความพร้อมการจัดสรร — พบงานที่ทับซ้อนกัน ${allocationConflicts.length} งาน`
                  : '🚦 ความพร้อมการจัดสรร — รถและคนขับว่างทั้งช่วงเวลานี้'}
              </p>
              <div className="mt-2 space-y-2">
                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                  {!chosenCarSet ? (
                    <p className="text-[11px] text-slate-400">🚗 ยังไม่ได้เลือก / ระบุรถ</p>
                  ) : carConflicts.length ? (
                    <>
                      <p className="text-[11px] font-bold text-rose-800">
                        🚗 รถ {chosenCarLabel} — ทับซ้อน {carConflicts.length} งาน
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {carConflicts.map(({ item }) => (
                          <li key={item.id} className="text-[10.5px] leading-relaxed text-rose-900">
                            {STATUS[item.status]?.emoji} {STATUS[item.status]?.short} · <b>{item.doc_number}</b> ·{' '}
                            {formatDateTimeRange(item.start_datetime, item.end_datetime)} · {item.destination}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-[11px] font-semibold text-emerald-700">
                      ✅ รถ {chosenCarLabel} — ว่างทั้งช่วงเวลานี้ (ไม่มีงานทับ)
                    </p>
                  )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-2.5">
                  {!chosenDriverSet ? (
                    <p className="text-[11px] text-slate-400">👤 ยังไม่ได้เลือก / ระบุคนขับ</p>
                  ) : driverConflicts.length ? (
                    <>
                      <p className="text-[11px] font-bold text-rose-800">
                        👤 คนขับ {chosenDriverLabel} — ทับซ้อน {driverConflicts.length} งาน
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {driverConflicts.map(({ item }) => (
                          <li key={item.id} className="text-[10.5px] leading-relaxed text-rose-900">
                            {STATUS[item.status]?.emoji} {STATUS[item.status]?.short} · <b>{item.doc_number}</b> ·{' '}
                            {formatDateTimeRange(item.start_datetime, item.end_datetime)} · {item.destination}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-[11px] font-semibold text-emerald-700">
                      ✅ คนขับ {chosenDriverLabel} — ว่างทั้งช่วงเวลานี้ (ไม่มีงานทับ)
                    </p>
                  )}
                </div>
              </div>
              <p
                className={classNames(
                  'mt-2 text-[10.5px] leading-relaxed',
                  allocationConflicts.length ? 'text-rose-700' : 'text-emerald-700',
                )}
              >
                {allocationConflicts.length
                  ? 'กด "บันทึกการจัดสรร" แล้วต้องยืนยันการบันทึกกระทบงานเดิมในหน้าต่างนี้ก่อน'
                  : 'ตรวจสดขณะเลือก — เทียบงานทุกสถานะที่จัดสรรไว้แล้ว ยกเว้นงานไม่อนุมัติ/ยกเลิก (ช่วงเวลาต่อกันพอดีไม่นับว่าทับซ้อน)'}
              </p>
            </div>

            {/* 🔔 เลือกการแจ้งเตือนก่อนออกรถ (ผูกกับงานนี้ — งานประจำปิดบางฉบับได้) */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-bold text-amber-800">
                🔔 การแจ้งเตือนก่อนออกรถ (เลือกตามความสำคัญของงาน)
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {REMINDER_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => setAllocation({ ...allocation, reminderLevels: preset.levels })}
                    className={classNames(
                      'rounded-full border px-2.5 py-1 text-[11px] font-semibold transition',
                      activePresetKey === preset.key
                        ? 'border-amber-700 bg-amber-700 text-white'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-amber-100',
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {REMINDER_LEVEL_OPTIONS.map((option) => {
                  const checked = allocation.reminderLevels.includes(option.key)
                  return (
                    <label key={option.key} className="flex items-start gap-2 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={checked}
                        onChange={() =>
                          setAllocation({
                            ...allocation,
                            reminderLevels: checked
                              ? allocation.reminderLevels.filter((level) => level !== option.key)
                              : [...allocation.reminderLevels, option.key],
                          })
                        }
                      />
                      <span>
                        <b>{option.label}</b> <span className="text-slate-400">— {option.hint}</span>
                        {checked ? (
                          <span className="block text-[10.5px] text-slate-400">
                            {reminderTimeText(option.key === 'passenger_10' ? 10 : Number(option.key))}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  )
                })}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-amber-700">
                {reminderSummaryText} — แก้ไขได้ทุกเมื่อด้วยการบันทึกการจัดสรรซ้ำ
              </p>
            </div>

            <button
              type="button"
              onClick={() => submitAllocation()}
              disabled={busy}
              className={classNames(
                'w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-900 disabled:opacity-60',
                allocationConflicts.length && !overlapConfirm ? 'bg-rose-600' : 'bg-slate-800',
              )}
            >
              {busy
                ? 'กำลังบันทึก...'
                : allocationConflicts.length && !overlapConfirm
                  ? 'บันทึกการจัดสรร (ทับซ้อน — ต้องยืนยัน)'
                  : 'บันทึกการจัดสรร'}
            </button>

            {overlapConfirm ? (
              <div className="rounded-xl border border-rose-300 bg-rose-50 p-3">
                <p className="text-xs font-semibold leading-relaxed text-rose-800">
                  ⚠️ การจัดสรรนี้ทับซ้อนกับงานเดิม {allocationConflicts.length} งาน (รายการด้านบน)
                  <br />
                  ยืนยันเพื่อบันทึกทั้งที่กระทบงานเดิม หรือกลับไปเลือกรถ/คนขับคันอื่น
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => submitAllocation(true)}
                    disabled={busy}
                    className="flex-1 rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    ยืนยันบันทึกกระทบงานเดิม
                  </button>
                  <button
                    type="button"
                    onClick={() => setOverlapConfirm(false)}
                    className="flex-1 rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-200"
                  >
                    กลับไปเลือกใหม่
                  </button>
                </div>
              </div>
            ) : null}

            {allocationStatus ? (
              <div
                className={classNames(
                  'rounded-xl border px-3.5 py-3 text-sm font-semibold',
                  allocationStatus.tone === 'green'
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-amber-200 bg-amber-50 text-amber-800',
                )}
              >
                <p>{allocationStatus.text}</p>
                {allocationStatus.sub ? (
                  <p className="mt-1 text-xs font-medium opacity-90">{allocationStatus.sub}</p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div> : null}

        {(car || driver || request.external_car_info || request.external_driver_name) ? (
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <p>
              🚐 {car ? `${car.license_plate} (${carTypeDisplay(car.car_type)})` : request.external_car_info || '-'}
            </p>
            <p className="mt-1">
              🧑‍✈️ {driver ? driver.full_name : request.external_driver_name || '-'}
            </p>
          </div>
        ) : null}

        {canReviewRequest &&
        (request.status === 'pending' || request.status === 'tentative') ? (
          <div className="flex flex-col gap-2 border-t border-slate-200 pt-4 sm:flex-row">
            <button
              type="button"
              onClick={handleApprove}
              disabled={busy}
              className="flex-1 rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              {request.status === 'tentative' ? 'ผอ.เขต อนุมัติ (อัปเดตระบบ)' : 'อนุมัติคำขอ / ล็อกคิว'}
            </button>
            <button
              type="button"
              onClick={() => onReject(request)}
              disabled={busy}
              className="flex-1 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              ไม่อนุมัติ
            </button>
          </div>
        ) : null}
        {approveStatus ? (
          <div
            className={classNames(
              'rounded-xl border px-3.5 py-3 text-sm font-semibold',
              approveStatus.tone === 'green'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-amber-200 bg-amber-50 text-amber-800',
            )}
          >
            <p>{approveStatus.text}</p>
            {approveStatus.sub ? (
              <p className="mt-1 text-xs font-medium opacity-90">{approveStatus.sub}</p>
            ) : null}
          </div>
        ) : null}
        {canCancelRequest && request.status === 'approved' ? (
          <div className="border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={() => onCancel(request)}
              disabled={busy}
              className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
            >
              ยกเลิกคำขอที่อนุมัติแล้ว และแจ้งผู้เกี่ยวข้อง
            </button>
          </div>
        ) : null}
      </div>
    </Modal>
  )
}

const selectClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Info({ label, value, className }) {
  return (
    <div className={classNames('rounded-xl bg-slate-50 px-3 py-2.5', className)}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800">{value}</p>
    </div>
  )
}

function ResourcesPanel({ cars, drivers, onReload, onError }) {
  const [carForm, setCarForm] = useState({
    license_plate: '',
    province: 'กรุงเทพมหานคร',
    car_type: '',
    owner_dept: 'education',
  })
  const [driverForm, setDriverForm] = useState({
    full_name: '',
    nickname: '',
    dept: 'education',
    line_user_id: '',
  })
  const [editingCar, setEditingCar] = useState(null)
  const [editCarForm, setEditCarForm] = useState({
    license_plate: '',
    province: 'กรุงเทพมหานคร',
    car_type: 'van',
    owner_dept: 'education',
  })
  const [editingDriver, setEditingDriver] = useState(null)
  const [editDriverForm, setEditDriverForm] = useState({
    full_name: '',
    nickname: '',
    dept: 'education',
    line_user_id: '',
    is_active: true,
  })
  const [busy, setBusy] = useState(false)

  const addCar = async (event) => {
    event.preventDefault()
    if (!carForm.license_plate.trim()) return
    setBusy(true)
    const { error } = await supabase.from('cars').insert({
      ...carForm,
      license_plate: carForm.license_plate.trim(),
    })
    setBusy(false)
    if (error) {
      onError(`เพิ่มรถไม่สำเร็จ: ${error.message}`)
      return
    }
    setCarForm({ license_plate: '', province: 'กรุงเทพมหานคร', car_type: 'van', owner_dept: 'education' })
    onReload()
  }

  const startEditCar = (car) => {
    setEditingCar(car)
    setEditCarForm({
      license_plate: car.license_plate,
      province: car.province || 'กรุงเทพมหานคร',
      car_type: car.car_type || 'van',
      owner_dept: car.owner_dept || 'education',
    })
  }

  const saveEditCar = async (event) => {
    event.preventDefault()
    if (!editingCar || !editCarForm.license_plate.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('cars')
      .update({
        license_plate: editCarForm.license_plate.trim(),
        province: editCarForm.province,
        car_type: editCarForm.car_type,
        owner_dept: editCarForm.owner_dept,
      })
      .eq('id', editingCar.id)
    setBusy(false)
    if (error) {
      onError(`แก้ไขข้อมูลรถไม่สำเร็จ: ${error.message}`)
      return
    }
    setEditingCar(null)
    onReload()
  }

  const deleteCar = async (car) => {
    const ok = window.confirm(
      `ต้องการลบรถทะเบียน "${car.license_plate}" หรือไม่?\nรายการคำขอที่เคยผูกกับรถคันนี้จะไม่ถูกลบ แต่จะเปลี่ยนเป็นยังไม่ระบุรถ`,
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('cars').delete().eq('id', car.id)
    setBusy(false)
    if (error) {
      onError(`ลบข้อมูลรถไม่สำเร็จ: ${error.message}`)
      return
    }
    onReload()
  }

  const addDriver = async (event) => {
    event.preventDefault()
    if (!driverForm.full_name.trim()) return
    setBusy(true)
    const { error } = await supabase.from('drivers').insert({
      ...driverForm,
      full_name: driverForm.full_name.trim(),
      nickname: driverForm.nickname.trim() || null,
      line_user_id: driverForm.line_user_id.trim() || null,
    })
    setBusy(false)
    if (error) {
      onError(`เพิ่มพนักงานขับรถไม่สำเร็จ: ${error.message}`)
      return
    }
    setDriverForm({ full_name: '', nickname: '', dept: 'education', line_user_id: '' })
    onReload()
  }

  const startEditDriver = (driver) => {
    setEditingDriver(driver)
    setEditDriverForm({
      full_name: driver.full_name,
      nickname: driver.nickname || '',
      dept: driver.dept || 'education',
      line_user_id: driver.line_user_id || '',
      is_active: Boolean(driver.is_active),
    })
  }

  const saveEditDriver = async (event) => {
    event.preventDefault()
    if (!editingDriver || !editDriverForm.full_name.trim()) return
    setBusy(true)
    const { error } = await supabase
      .from('drivers')
      .update({
        full_name: editDriverForm.full_name.trim(),
        nickname: editDriverForm.nickname.trim() || null,
        dept: editDriverForm.dept,
        line_user_id: editDriverForm.line_user_id.trim() || null,
        is_active: editDriverForm.is_active,
      })
      .eq('id', editingDriver.id)
    setBusy(false)
    if (error) {
      onError(`แก้ไขข้อมูลคนขับไม่สำเร็จ: ${error.message}`)
      return
    }
    setEditingDriver(null)
    onReload()
  }

  const deleteDriver = async (driver) => {
    const ok = window.confirm(
      `ต้องการลบพนักงานขับรถ "${driver.full_name}" หรือไม่?\nรายการคำขอที่เคยผูกกับพนักงานขับรถคนนี้จะไม่ถูกลบ แต่จะเปลี่ยนเป็นยังไม่ระบุคนขับ`,
    )
    if (!ok) return
    setBusy(true)
    const { error } = await supabase.from('drivers').delete().eq('id', driver.id)
    setBusy(false)
    if (error) {
      onError(`ลบพนักงานขับรถไม่สำเร็จ: ${error.message}`)
      return
    }
    onReload()
  }

  const toggleDriver = async (driver) => {
    setBusy(true)
    const { error } = await supabase
      .from('drivers')
      .update({ is_active: !driver.is_active })
      .eq('id', driver.id)
    setBusy(false)
    if (error) {
      onError(`อัปเดตสถานะคนขับไม่สำเร็จ: ${error.message}`)
      return
    }
    onReload()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle title="รถราชการในระบบ" subtitle={`ทั้งหมด ${cars.length} คัน (เพิ่ม / ลบ / แก้ไข ได้)`} />
        <div className="space-y-2">
          {cars.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลรถ</p>
          ) : (
            cars.map((car) => (
              <div
                key={car.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-slate-300"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">{car.license_plate}</p>
                  <p className="text-xs text-slate-500">
                    {carTypeDisplay(car.car_type) || 'รถ'} · {car.province} ·{' '}
                    {car.owner_dept === 'education' ? 'รถฝ่ายเรา' : 'รถยืมฝ่ายอื่น'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => startEditCar(car)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    ✏️ แก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteCar(car)}
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    🗑️ ลบ
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <form onSubmit={addCar} className="mt-4 space-y-3 rounded-xl bg-brand-50/60 p-4">
          <p className="text-sm font-semibold text-brand-800">➕ เพิ่มรถใหม่</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              value={carForm.license_plate}
              onChange={(event) => setCarForm({ ...carForm, license_plate: event.target.value })}
              placeholder="เลขทะเบียน เช่น ฮว 4098"
              className={selectClass}
            />
            <input
              value={carForm.car_type}
              onChange={(event) => setCarForm({ ...carForm, car_type: event.target.value.trim() })}
              placeholder="ระบุประเภทรถ เช่น รถตู้, รถกระบะ, รถบัส"
              className={selectClass}
              aria-label="ประเภทรถ"
            />
            <input
              list="car-province-list"
              value={carForm.province}
              onChange={(event) => setCarForm({ ...carForm, province: event.target.value })}
              className={selectClass}
            />
            <datalist id="car-province-list">
              {PROVINCES.map((province) => (
                <option key={province} value={province} />
              ))}
            </datalist>
            <select
              value={carForm.owner_dept}
              onChange={(event) => setCarForm({ ...carForm, owner_dept: event.target.value })}
              className={selectClass}
            >
              <option value="education">รถฝ่ายเรา</option>
              <option value="external">รถยืมฝ่ายอื่น</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
          >
            บันทึกรถใหม่
          </button>
        </form>
      </Card>

      <Card className="p-5">
        <SectionTitle title="พนักงานขับรถ" subtitle={`ทั้งหมด ${drivers.length} คน (จัดการได้ที่หน้าจัดการสมาชิก)`} />
        <div className="space-y-2">
          {drivers.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">ยังไม่มีข้อมูลคนขับ</p>
          ) : (
            drivers.map((driver) => (
              <div
                key={driver.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-slate-300"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {driver.full_name}{driver.nickname ? ` (${driver.nickname})` : ''}
                  </p>
                  <p className="text-xs text-slate-500">
                    {driver.driver_dept_type === 'education' ? 'ฝ่ายเรา' : 'ฝ่ายอื่น'} ·{' '}
                    {driver.line_user_id ? 'ผูก LINE แล้ว' : 'ยังไม่ผูก LINE'}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggleDriver(driver)}
                    disabled={busy}
                    className={`rounded-lg px-2 py-1 text-xs font-medium ${
                      driver.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {driver.status === 'active' ? 'พร้อม' : 'ปิด'}
                  </button>
                  <button
                    type="button"
                    onClick={() => startEditDriver(driver)}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteDriver(driver)}
                    className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
        <div className="mt-3 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <p className="font-semibold">💡 การเพิ่มหรือแก้ไขข้อมูลคนขับ</p>
          <p className="text-xs mt-1">กรุณาไปที่หน้า <b>จัดการสมาชิก</b> เพื่อเพิ่ม แก้ไข หรือลบพนักงานขับรถ (เลือกบทบาทเป็น "พนักงานขับรถ")</p>
        </div>
      </Card>

      {/* Modal แก้ไขข้อมูลรถ */}
      <Modal open={Boolean(editingCar)} onClose={() => setEditingCar(null)} title="แก้ไขข้อมูลรถยนต์">
        <form onSubmit={saveEditCar} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">เลขทะเบียนรถ *</label>
            <input
              required
              value={editCarForm.license_plate}
              onChange={(e) => setEditCarForm({ ...editCarForm, license_plate: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ประเภทรถ</label>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-700">ประเภทรถ</label>
                <input
                  value={editCarForm.car_type}
                  onChange={(e) => setEditCarForm({ ...editCarForm, car_type: e.target.value.trim() })}
                  placeholder="ระบุประเภทรถ เช่น รถตู้, รถกระบะ"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">สังกัดรถ</label>
              <select
                value={editCarForm.owner_dept}
                onChange={(e) => setEditCarForm({ ...editCarForm, owner_dept: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="education">รถฝ่ายเรา</option>
                <option value="external">รถยืมฝ่ายอื่น</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">จังหวัดป้ายทะเบียน</label>
            <input
              list="car-province-edit-list"
              value={editCarForm.province}
              onChange={(e) => setEditCarForm({ ...editCarForm, province: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
            <datalist id="car-province-edit-list">
              {PROVINCES.map((province) => (
                <option key={province} value={province} />
              ))}
            </datalist>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setEditingCar(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal แก้ไขข้อมูลพนักงานขับรถ */}
      <Modal open={Boolean(editingDriver)} onClose={() => setEditingDriver(null)} title="แก้ไขข้อมูลพนักงานขับรถ">
        <form onSubmit={saveEditDriver} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อ-สกุล *</label>
              <input
                required
                value={editDriverForm.full_name}
                onChange={(e) => setEditDriverForm({ ...editDriverForm, full_name: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อเล่น</label>
              <input
                value={editDriverForm.nickname}
                onChange={(e) => setEditDriverForm({ ...editDriverForm, nickname: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">สังกัดคนขับ</label>
              <select
                value={editDriverForm.dept}
                onChange={(e) => setEditDriverForm({ ...editDriverForm, dept: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="education">คนขับฝ่ายเรา</option>
                <option value="external">คนขับฝ่ายอื่น</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">สถานะความพร้อม</label>
              <select
                value={editDriverForm.is_active ? 'active' : 'inactive'}
                onChange={(e) => setEditDriverForm({ ...editDriverForm, is_active: e.target.value === 'active' })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"
              >
                <option value="active">พร้อมปฏิบัติงาน</option>
                <option value="inactive">ปิดใช้งานชั่วคราว</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">LINE User ID (สำหรับแจ้งเตือน)</label>
            <input
              value={editDriverForm.line_user_id}
              onChange={(e) => setEditDriverForm({ ...editDriverForm, line_user_id: e.target.value })}
              placeholder="U1234567890abcdef"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setEditingDriver(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function ReportsPanel({ requests, cars, drivers, onReload, onError }) {
  const current = currentFiscalYear()
  const years = useMemo(() => {
    const set = new Set([current, current - 1, current - 2, current - 3])
    requests.forEach((item) => {
      const year = fiscalYearOf(item.start_datetime)
      if (year) set.add(year)
    })
    return Array.from(set).sort((a, b) => b - a)
  }, [requests, current])
  const [fiscalYear, setFiscalYear] = useState(current)
  const [busy, setBusy] = useState(false)

  const exportCsv = () => {
    const range = fiscalYearRange(fiscalYear)
    const rows = requests
      .filter((item) => {
        const date = new Date(item.start_datetime)
        return date >= range.start && date <= range.end
      })
      .map((item) => {
        const car = cars.find((carItem) => carItem.id === item.assigned_car_id)
        const driver = drivers.find((driverItem) => driverItem.id === item.assigned_driver_id)
        return [
          item.doc_number,
          DOC_TYPE[item.doc_type] || '',
          item.requester_name,
          item.requester_position,
          item.requester_department,
          item.phone || '',
          item.destination,
          item.destination_province,
          formatDate(item.start_datetime, true),
          formatDate(item.end_datetime, true),
          item.passenger_count,
          car ? `${car.license_plate} (${carTypeDisplay(car.car_type)})` : item.external_car_info || '',
          driver ? driver.full_name : item.external_driver_name || '',
          item.status,
          APPROVAL_TYPE[item.approval_type]?.label || '',
          item.director_approval_status,
          item.purpose || '',
        ]
      })

    if (rows.length === 0) {
      window.alert('ไม่พบข้อมูลในช่วงปีงบประมาณที่เลือก')
      return
    }

    const header = [
      'เลขที่เอกสาร','ประเภทเอกสาร','ชื่อผู้ขอ','ตำแหน่ง','สังกัด','โทรศัพท์','ปลายทาง','จังหวัด',
      'วันเวลาเริ่มต้น','วันเวลาสิ้นสุด','จำนวนผู้โดยสาร','รถ','พนักงานขับรถ','สถานะ','ผู้อนุมัติ',
      'สถานะ ผอ.เขต','วัตถุประสงค์',
    ]
    downloadCsv(`car-requests-fiscal-${fiscalYear}.csv`, [header, ...rows])
  }

  const purge = async () => {
    const cutoff = new Date()
    cutoff.setFullYear(cutoff.getFullYear() - 2)
    const ok = window.confirm(
      `ต้องการลบข้อมูลคำขอที่สิ้นสุดก่อนวันที่ ${formatDate(cutoff, false)} หรือไม่\nข้อมูลที่ลบแล้วจะกู้คืนไม่ได้`,
    )
    if (!ok) return

    setBusy(true)
    const { data, error } = await supabase
      .from('car_requests')
      .delete()
      .lt('end_datetime', cutoff.toISOString())
      .select('id')
    setBusy(false)

    if (error) {
      onError(`ลบข้อมูลไม่สำเร็จ: ${error.message}`)
      return
    }
    window.alert(`ลบข้อมูลเรียบร้อย ${data?.length || 0} รายการ`)
    onReload()
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card className="p-5">
        <SectionTitle
          title="ส่งออกข้อมูลตามปีงบประมาณ"
          subtitle="ปีงบประมาณ 1 ตุลาคม ถึง 30 กันยายน ของปีถัดไป"
        />
        <div className="space-y-3">
          <select
            value={fiscalYear}
            onChange={(event) => setFiscalYear(Number(event.target.value))}
            className={selectClass}
          >
            {years.map((year) => (
              <option key={year} value={year}>
                ปีงบประมาณ พ.ศ. {year} (1 ต.ค. {year - 543} - 30 ก.ย. {year - 542})
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={exportCsv}
            className="w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            ดาวน์โหลดไฟล์ CSV (เปิดได้ใน Excel)
          </button>
          <p className="text-xs leading-relaxed text-slate-500">
            ไฟล์ถูกเข้ารหัส UTF-8 พร้อม BOM เพื่อให้ภาษาไทยแสดงผลถูกต้องใน Microsoft Excel
          </p>
        </div>
      </Card>

      <Card className="border-rose-100 p-5">
        <SectionTitle
          title="ล้างข้อมูลย้อนหลัง 2 ปี"
          subtitle="จัดการพื้นที่ฐานข้อมูล Supabase ตามนโยบายเก็บรักษาข้อมูล"
        />
        <div className="space-y-3">
          <Alert tone="warning">
            ระบบจะลบเฉพาะรายการที่วันสิ้นสุดการเดินทางเก่ากว่า 2 ปี นับจากวันนี้
            และไม่สามารถกู้คืนได้ แนะนำให้ส่งออก CSV เก็บไว้ก่อน
          </Alert>
          <button
            type="button"
            onClick={purge}
            disabled={busy}
            className="w-full rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
          >
            {busy ? 'กำลังลบข้อมูล...' : 'ลบข้อมูลย้อนหลังเกิน 2 ปี'}
          </button>
        </div>
      </Card>
    </div>
  )
}
