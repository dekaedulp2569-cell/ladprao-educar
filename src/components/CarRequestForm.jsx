import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { buildStatusMessage, notifyLine } from '../lib/line'
import { PROVINCES } from '../lib/provinces'
import {
  APPROVAL_TYPE,
  DOC_TYPE,
  STATUS,
  formatDate,
  carTypeDisplay,
  formatDateTimeRange,
  includesWeekend,
  isOutOfBkk,
  isOutOfHours,
  dateKey,
  THAI_MONTHS_LONG,
  toISO,
} from '../lib/helpers'
import { Alert, Card, SectionTitle } from './ui'
import { NotificationPopup } from './NotificationPopup'
import { RelatedPeoplePicker } from './RelatedPeoplePicker'
import { openForm3PrintWindow } from '../lib/printForm3'

const emptyForm = {
  request_date: '',
  doc_type: 'school_letter',
  doc_number: '',
  requester_name: '',
  requester_position: '',
  requester_department: 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
  phone: '',
  destination: '',
  destination_province: 'กรุงเทพมหานคร',
  pickup_location: 'สำนักงานเขตลาดพร้าว',
  passenger_name: '',
  passenger_phone: '',
  start_datetime: '',
  end_datetime: '',
  passenger_count: 1,
  purpose: '',
  is_public_holiday: false,
  related_line_user_ids: [],
}

// ⏱️ ปุ่มเวลาด่วน — ช่วงเวลามาตรฐานที่อยู่ในเวลาราชการ 08:00-16:00 น. เสมอ
// (ตัดสินใจล็อกแล้ว: ไม่ใช้ 08:30-16:30 เพื่อไม่ให้คำขอโดนสถานะ "รอ ผอ.เขต พิจารณา" อัตโนมัติ)
const TIME_PRESETS = [
  { id: 'full', label: 'เต็มวันทำการ', times: '08:00 – 16:00 น.', start: '08:00', end: '16:00', full: true },
  { id: 'am', label: 'ครึ่งวันเช้า', times: '08:00 – 12:00 น.', start: '08:00', end: '12:00' },
  { id: 'pm', label: 'ครึ่งวันบ่าย', times: '13:00 – 16:00 น.', start: '13:00', end: '16:00' },
]

export function CarRequestForm({ onSubmitted }) {
  const { session } = useAuth()
  const [form, setForm] = useState(() => ({
    ...emptyForm,
    request_date: dateKey(new Date()),
    requester_name: session?.name || '',
    requester_position: session?.position || '',
    requester_department: session?.department || emptyForm.requester_department,
  }))
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(null)
  const [serverError, setServerError] = useState('')
  const [lineNotification, setLineNotification] = useState(null)
  const [resendingNotification, setResendingNotification] = useState(false)
  // 🚦 ผลการตรวจสดช่วงเวลาที่กรอก: null = ยังไม่ตรวจ, [] = ว่าง, [...งาน] = มีงานล็อกคิวทับกัน
  const [timeConflicts, setTimeConflicts] = useState(null)
  const [calendarCars, setCalendarCars] = useState([])

  const update = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  // ⏱️ ปุ่มเวลาด่วน: ใช้วันที่จากช่องเริ่มต้นที่กรอกไว้แล้วถ้ามี มิฉะนั้นใช้วันนี้ (ไม่แตะช่องอื่น)
  const presetTravelDate = form.start_datetime?.slice(0, 10) || dateKey(new Date())

  const applyTimePreset = (preset) => {
    update('start_datetime', `${presetTravelDate}T${preset.start}`)
    update('end_datetime', `${presetTravelDate}T${preset.end}`)
  }

  const sendRequestNotification = async (request) => {
    setResendingNotification(true)
    const statusLabel =
      request.status === 'tentative' ? 'รอ ผอ.เขต อนุมัติ' : 'รอตรวจสอบ'
    const notification = await notifyLine({
      type: 'status',
      statusLabel,
      request,
      text: buildStatusMessage(request, statusLabel),
    })
    setLineNotification(
      notification?.ok
        ? { ok: true, message: 'ส่งข้อความยืนยันไปยัง LINE ของคุณและกลุ่มฝ่ายแล้ว' }
        : {
            ok: false,
            message: `บันทึกคำขอแล้ว แต่ส่ง LINE ยืนยันไม่สำเร็จ: ${
              notification?.reason || 'ตรวจการตั้งค่า LINE และการเชื่อมบัญชี'
            }`,
          },
    )
    setResendingNotification(false)
  }

  const special = useMemo(
    () =>
      isOutOfHours(form.start_datetime, form.end_datetime) ||
      isOutOfBkk(form.destination_province) ||
      includesWeekend(form.start_datetime, form.end_datetime) ||
      form.is_public_holiday,
    [form.start_datetime, form.end_datetime, form.destination_province, form.is_public_holiday],
  )

  // โหลดรถในระบบหนึ่งครั้งเพื่อแสดงทะเบียนของงานที่ล็อกคิวแล้ว
  useEffect(() => {
    let cancelled = false
    supabase
      .from('cars')
      .select('id, license_plate, car_type')
      .then(({ data }) => {
        if (!cancelled) setCalendarCars(data || [])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 🚦 ตรวจสดผ่าน view สาธารณะ (งานอนุมัติแล้ว 🟢 + รอ ผอ.เขต 🟠):
  // ช่วงเวลาที่กรอกทับกับงานล็อกคิวหรือไม่ — คำเตือนอ่อน ส่งคำขอได้ตามปกติ
  useEffect(() => {
    const start = form.start_datetime ? new Date(form.start_datetime) : null
    const end = form.end_datetime ? new Date(form.end_datetime) : null
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setTimeConflicts(null)
      return
    }
    const startISO = toISO(form.start_datetime)
    const endISO = toISO(form.end_datetime)
    let active = true
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('public_car_calendar')
        .select('id, status, destination, start_datetime, end_datetime, assigned_car_id, external_car_info')
        .lt('start_datetime', endISO)
        .gt('end_datetime', startISO)
      if (active) setTimeConflicts(data || [])
    }, 400)
    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [form.start_datetime, form.end_datetime])

  const validation = () => {
    const nextErrors = {}
    if (!form.request_date) {
      nextErrors.request_date = 'เลือกวันที่ยื่นคำขอ'
    } else {
      const [year, month, day] = form.request_date.split('-').map(Number)
      const parsed = new Date(Date.UTC(year, month - 1, day))
      if (
        !year ||
        !month ||
        !day ||
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day
      ) {
        nextErrors.request_date = 'วันที่ยื่นคำขอไม่ถูกต้อง'
      }
    }
    if (!form.doc_number.trim()) nextErrors.doc_number = 'ระบุเลขที่หนังสือราชการหรือบันทึกข้อความ'
    if (!form.requester_name.trim()) nextErrors.requester_name = 'ระบุชื่อ-สกุลผู้ขอ'
    if (!form.requester_position.trim()) nextErrors.requester_position = 'ระบุตำแหน่ง'
    if (!form.requester_department.trim()) nextErrors.requester_department = 'ระบุสังกัด'
    if (!form.destination.trim()) nextErrors.destination = 'ระบุสถานที่ไปราชการ'
    if (!form.start_datetime) nextErrors.start_datetime = 'เลือกวันและเวลาเริ่มต้น'
    if (!form.end_datetime) nextErrors.end_datetime = 'เลือกวันและเวลาสิ้นสุด'
    if (form.start_datetime && form.end_datetime) {
      if (new Date(form.end_datetime) <= new Date(form.start_datetime)) {
        nextErrors.end_datetime = 'เวลาสิ้นสุดต้องหลังเวลาเริ่มต้น'
      }
    }
    if (!form.passenger_count || Number(form.passenger_count) < 1) {
      nextErrors.passenger_count = 'จำนวนผู้โดยสารต้องอย่างน้อย 1 คน'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const submit = async (event) => {
    event.preventDefault()
    setServerError('')
    if (!validation()) return

    setSubmitting(true)
    const payload = {
      requester_auth_user_id: session.userId,
      request_date: form.request_date,
      doc_type: form.doc_type,
      doc_number: form.doc_number.trim(),
      requester_name: form.requester_name.trim(),
      requester_position: form.requester_position.trim(),
      requester_department: form.requester_department.trim(),
      phone: form.phone.trim() || null,
      destination: form.destination.trim(),
      destination_province: form.destination_province,
      pickup_location: form.pickup_location.trim(),
      passenger_name: form.passenger_name.trim() || null,
      passenger_phone: form.passenger_phone.trim() || null,
      start_datetime: toISO(form.start_datetime),
      end_datetime: toISO(form.end_datetime),
      passenger_count: Number(form.passenger_count),
      purpose: form.purpose.trim() || null,
      is_out_of_hours: isOutOfHours(form.start_datetime, form.end_datetime),
      is_out_of_bkk: isOutOfBkk(form.destination_province),
      is_weekend: includesWeekend(form.start_datetime, form.end_datetime),
      is_public_holiday: Boolean(form.is_public_holiday),
      approval_type: special ? 'district_director' : 'head_of_dept',
      status: special ? 'tentative' : 'pending',
      director_approval_status: special ? 'pending' : 'not_required',
      related_line_user_ids: form.related_line_user_ids,
    }

    const { data, error } = await supabase
      .from('car_requests')
      .insert(payload)
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      setServerError(`บันทึกไม่สำเร็จ: ${error.message}`)
      return
    }

    setSubmitted({ ...payload, ...(data || {}) })
    setForm((current) => ({
      ...emptyForm,
      request_date: dateKey(new Date()),
      requester_name: current.requester_name,
      requester_position: current.requester_position,
      requester_department: current.requester_department,
      phone: current.phone,
      related_line_user_ids: [],
    }))

    // บันทึกคำขอก่อน แล้วรายงานผลการส่ง LINE แยกจากผลการบันทึก
    const saved = { ...payload, ...(data || {}) }
    await sendRequestNotification(saved)
  }

  if (submitted) {
    const approval = APPROVAL_TYPE[submitted.approval_type]
    const tentative = submitted.status === 'tentative'
    const [requestYear, requestMonth, requestDay] = (submitted.request_date || '').split('-').map(Number)
    const requestDateLabel = requestYear && requestMonth && requestDay
      ? `วันที่ ${requestDay} เดือน ${THAI_MONTHS_LONG[requestMonth - 1]} พ.ศ. ${requestYear + 543}`
      : 'ไม่ระบุวันที่ยื่นคำขอ'
    const specialReasons = [
      submitted.is_out_of_bkk ? 'ออกนอกกรุงเทพมหานคร' : null,
      submitted.is_out_of_hours ? 'นอกเวลาราชการ' : null,
      submitted.is_weekend ? 'วันเสาร์-อาทิตย์' : null,
      submitted.is_public_holiday ? 'วันหยุดนักขัตฤกษ์' : null,
    ].filter(Boolean)
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-br from-emerald-600 to-brand-800 px-6 py-8 text-white">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-2xl">
              ✓
            </div>
            <h2 className="text-xl font-bold sm:text-2xl">ส่งคำขอใช้รถเรียบร้อยแล้ว</h2>
            <p className="mt-1 text-sm text-emerald-50">
              ระบบบันทึกคำขอเรียบร้อยแล้ว
            </p>
          </div>
          <div className="space-y-4 p-6">
            {lineNotification ? (
              <NotificationPopup
                open={true}
                message={lineNotification.message}
                type={lineNotification.ok ? 'success' : 'warning'}
                onClose={() => setLineNotification(null)}
              />
            ) : null}
            {lineNotification && !lineNotification.ok ? (
              <button
                type="button"
                onClick={() => void sendRequestNotification(submitted)}
                disabled={resendingNotification}
                className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-60"
              >
                {resendingNotification ? 'กำลังส่ง...' : 'ลองส่ง LINE อีกครั้ง'}
              </button>
            ) : null}
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">เลขที่เอกสาร</p>
                <p className="font-semibold text-slate-800">{submitted.doc_number}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">วันที่ยื่นคำขอ</p>
                <p className="font-semibold text-slate-800">{requestDateLabel}</p>
              </div>
              <div className={`rounded-xl border px-4 py-3 ${(tentative ? STATUS.tentative : STATUS.pending).className}`}>
                <p className="text-xs opacity-80">สถานะ</p>
                <p className="font-semibold">
                  {(tentative ? STATUS.tentative : STATUS.pending).emoji}{' '}
                  {tentative ? 'รอผู้อำนวยการเขตลาดพร้าวพิจารณาอนุมัติ' : 'รอตรวจสอบ'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 sm:col-span-2">
                <p className="text-xs text-slate-500">เส้นทางอนุมัติ</p>
                <p className="font-semibold text-slate-800">
                  {approval.document} → {approval.label}
                </p>
                <p className="text-xs text-slate-500">{approval.line}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 sm:col-span-2">
                <p className="text-xs text-slate-500">เงื่อนไขการอนุมัติ</p>
                <p className="mt-1 font-medium text-slate-800">
                  {specialReasons.length ? specialReasons.join(' · ') : 'เดินทางในเวลาราชการและวันทำการ'}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">วันเวลาเริ่มต้น</p>
                <p className="font-medium text-slate-800">{formatDate(submitted.start_datetime, true)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">วันเวลาสิ้นสุด</p>
                <p className="font-medium text-slate-800">{formatDate(submitted.end_datetime, true)}</p>
              </div>
            </div>

            {tentative ? (
              <Alert tone="warning">
                คำขอนี้อยู่นอกเวลาราชการหรือออกนอกพื้นที่กรุงเทพมหานคร
                ต้องเสนอ ผอ.เขตลาดพร้าว ลงนามอนุมัติ (ปฏิบัติราชการแทน ปลัดกรุงเทพมหานคร)
                โดยเจ้าหน้าที่จะอัปเดตสถานะอีกครั้งหลังได้รับหนังสืออนุมัติ
              </Alert>
            ) : (
              <Alert tone="success">
                คำขอนี้อยู่ในเวลาราชการและอยู่ในพื้นที่กรุงเทพมหานคร
                หัวหน้าฝ่ายการศึกษาสามารถพิจารณาอนุมัติได้ทันที
              </Alert>
            )}

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-900">เอกสารสำหรับลงนามสั่งใช้รถ</p>
              <p className="mt-1 text-xs text-emerald-700">
                เปิด &quot;แบบ ๓ ใบขออนุญาตใช้รถส่วนกลาง&quot; (A4 / เลขไทย) ในแท็บใหม่
                เพื่อพิมพ์และนำไปเสนอผู้บังคับบัญชาลงนาม
              </p>
              <button
                type="button"
                onClick={() => openForm3PrintWindow(submitted)}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
              >
                🖨️ พิมพ์แบบ ๓ (A4)
              </button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => {
                  setSubmitted(null)
                  setLineNotification(null)
                  if (onSubmitted) onSubmitted(null, 'calendar')
                }}
                className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                ปิดและดูปฏิทินการใช้รถ
              </button>
            </div>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl">
      <SectionTitle
        title="ยื่นคำขอใช้รถส่วนกลาง (ฝ่ายการศึกษา)"
        subtitle="กรอกข้อมูลให้ครบถ้วน ระบบจะตรวจสอบเงื่อนไขการอนุมัติให้อัตโนมัติ"
      />

      <form onSubmit={submit} className="space-y-5">
        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs">1</span>
            ข้อมูลเอกสารอ้างอิง
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ประเภทเอกสาร" required>
              <select
                value={form.doc_type}
                onChange={(event) => update('doc_type', event.target.value)}
                className={inputClass}
              >
                <option value="school_letter">{DOC_TYPE.school_letter}</option>
                <option value="dept_form">{DOC_TYPE.dept_form}</option>
              </select>
            </Field>
            <Field label="เลขที่หนังสือราชการ / บันทึกข้อความ" required error={errors.doc_number}>
              <input
                value={form.doc_number}
                onChange={(event) => update('doc_number', event.target.value)}
                placeholder="เช่น ที่ กท 5406/123"
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">
                หากยังไม่มีเลขที่หนังสือ (รอเลขรับ) ให้พิมพ์ - ต่อสามารถส่งคำขอได้เลย
              </p>
            </Field>
            <Field label="วันที่ยื่นคำขอ (วัน / เดือน / พ.ศ.)" required error={errors.request_date}>
              <div className="space-y-2">
                <input
                  type="date"
                  value={form.request_date}
                  onChange={(event) => update('request_date', event.target.value)}
                  className={inputClass}
                />
                <p className="text-xs text-slate-600" aria-live="polite">
                  {(() => {
                    const [year, month, day] = (form.request_date || '').split('-').map(Number)
                    if (!year || !month || !day || !THAI_MONTHS_LONG[month - 1]) {
                      return 'เลือกวันที่ เดือน และปี พ.ศ.'
                    }
                    return `วันที่ ${day} เดือน ${THAI_MONTHS_LONG[month - 1]} พ.ศ. ${year + 543}`
                  })()}
                </p>
              </div>
            </Field>
            <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-slate-700 sm:col-span-2">
              <input
                type="checkbox"
                checked={Boolean(form.is_public_holiday)}
                onChange={(event) => update('is_public_holiday', event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
              />
              <span>
                <span className="block font-medium">เดินทางในวันหยุดนักขัตฤกษ์ หรือวันหยุดราชการกรณีพิเศษ</span>
                <span className="mt-0.5 block text-xs text-slate-500">
                  ติ๊กเลือกเมื่อวันเดินทางตรงกับวันหยุด เพื่อให้ระบบเสนอ ผอ.เขตลาดพร้าว โดยอัตโนมัติ
                  (วันเสาร์-อาทิตย์ ระบบตรวจให้เองอยู่แล้ว)
                </span>
              </span>
            </label>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs">2</span>
            ข้อมูลผู้ขอใช้รถและผู้ประสานงาน
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="ชื่อ-สกุล" required error={errors.requester_name}>
              <input
                value={form.requester_name}
                onChange={(event) => update('requester_name', event.target.value)}
                placeholder="เช่น นายรัชชานนท์ ประจงกิจ"
                className={inputClass}
              />
            </Field>
            <Field label="ตำแหน่ง" required error={errors.requester_position}>
              <input
                value={form.requester_position}
                onChange={(event) => update('requester_position', event.target.value)}
                placeholder="เช่น เจ้าพนักงานธุรการปฏิบัติงาน"
                className={inputClass}
              />
            </Field>
            <Field label="สังกัด / หน่วยงาน" required error={errors.requester_department}>
              <input
                value={form.requester_department}
                onChange={(event) => update('requester_department', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="เบอร์โทรศัพท์">
              <input
                value={form.phone}
                onChange={(event) => update('phone', event.target.value)}
                placeholder="เช่น 02-123-4567 หรือ 08x-xxx-xxxx"
                className={inputClass}
              />
            </Field>
            <Field label="ผู้ประสานงานระหว่างเดินทาง (กรณีไม่ใช่ผู้ขอ)">
              <input
                value={form.passenger_name}
                onChange={(event) => update('passenger_name', event.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">เช่น ครูผู้ควบคุมแถว หรือเจ้าหน้าที่หน้างาน</p>
            </Field>
            <Field label="เบอร์โทรผู้ประสานงาน">
              <input
                value={form.passenger_phone}
                onChange={(event) => update('passenger_phone', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="จำนวนผู้โดยสาร" required error={errors.passenger_count}>
              <input
                type="number"
                min="1"
                value={form.passenger_count}
                onChange={(event) => update('passenger_count', event.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs">3</span>
            วันเวลาและเส้นทางเดินทาง
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="สถานที่ไปราชการ / ปลายทาง" required error={errors.destination} className="sm:col-span-2">
              <input
                value={form.destination}
                onChange={(event) => update('destination', event.target.value)}
                placeholder="เช่น ศาลาว่าการกรุงเทพมหานคร หรือโรงเรียนในสังกัด"
                className={inputClass}
              />
            </Field>
            <Field label="จังหวัดปลายทาง" required>
              <input
                list="province-list"
                value={form.destination_province}
                onChange={(event) => update('destination_province', event.target.value)}
                className={inputClass}
              />
              <datalist id="province-list">
                {PROVINCES.map((province) => (
                  <option key={province} value={province} />
                ))}
              </datalist>
            </Field>
            <Field label="จุดนัดรับผู้โดยสาร (ต้นทาง)" required>
              <input
                value={form.pickup_location}
                onChange={(event) => update('pickup_location', event.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">ปกติคือสำนักงานเขตลาดพร้าว หรือชื่อโรงเรียนของท่าน</p>
            </Field>
            <div className="sm:col-span-2">
              <p className="mb-1.5 text-sm font-medium text-slate-700">
                ⏱️ ปุ่มเวลาด่วน
                <span className="ml-2 text-xs font-normal text-slate-500">
                  กดครั้งเดียวได้เวลามาตรฐานทันที ไม่ต้องกดเลือกทีละนาที
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {TIME_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyTimePreset(preset)}
                    className={`rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 text-left transition hover:border-brand-400 hover:bg-brand-100 cursor-pointer ${
                      preset.full ? 'col-span-2' : ''
                    }`}
                  >
                    <span className="block text-xs font-semibold text-brand-800">{preset.label}</span>
                    <span className="block text-[10.5px] font-medium text-slate-500">{preset.times}</span>
                  </button>
                ))}
              </div>
            </div>
            <Field label="วันและเวลาเริ่มต้น" required error={errors.start_datetime}>
              <input
                type="datetime-local"
                value={form.start_datetime}
                onChange={(event) => update('start_datetime', event.target.value)}
                className={inputClass}
              />
            </Field>
            <Field label="วันและเวลาสิ้นสุด" required error={errors.end_datetime}>
              <input
                type="datetime-local"
                value={form.end_datetime}
                onChange={(event) => update('end_datetime', event.target.value)}
                className={inputClass}
              />
            </Field>
            {timeConflicts !== null ? (
              timeConflicts.length ? (
                <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/40 p-3">
                  <p className="text-xs font-bold text-amber-800">
                    🟠 ช่วงเวลานี้มีคิวรถที่ล็อกไปแล้ว {timeConflicts.length} งาน — ไม่เป็นไร ยังยื่นคำขอได้ตามปกติ
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {timeConflicts.map((item) => {
                      const conflictCar = calendarCars.find((car) => car.id === item.assigned_car_id)
                      return (
                        <li
                          key={item.id}
                          className="rounded-lg border border-amber-200 bg-white px-2.5 py-2 text-[11px] leading-relaxed text-amber-900"
                        >
                          {STATUS[item.status]?.emoji} {STATUS[item.status]?.short} ·{' '}
                          <b className="font-semibold">{item.destination}</b> ·{' '}
                          {formatDateTimeRange(item.start_datetime, item.end_datetime)} · รถ:{' '}
                          {conflictCar
                            ? `${conflictCar.license_plate} (${carTypeDisplay(conflictCar.car_type)})`
                            : item.external_car_info || 'ยังไม่จัดสรรรถ'}
                        </li>
                      )
                    })}
                  </ul>
                  <p className="mt-2 rounded-lg bg-amber-100/60 px-2.5 py-2 text-[11px] leading-relaxed text-amber-700">
                    ท่านยังสามารถยื่นคำขอได้ตามปกติ — เจ้าหน้าที่จะพิจารณาจัดสรรรถว่างให้
                    หรือประสานปรับเวลากับผู้ขออีกครั้ง โดยระบบจะแจ้งผลการจัดสรรให้ท่านผ่าน LINE
                  </p>
                </div>
              ) : (
                <div className="sm:col-span-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3">
                  <p className="text-xs font-bold text-emerald-800">
                    ✅ ช่วงเวลานี้ว่าง — ไม่มีงานล็อกคิวทับกัน
                  </p>
                </div>
              )
            ) : null}
            <Field label="วัตถุประสงค์เพิ่มเติม" className="sm:col-span-2">
              <textarea
                value={form.purpose}
                onChange={(event) => update('purpose', event.target.value)}
                rows={3}
                placeholder="ระบุวัตถุประสงค์หรือรายละเอียดเพิ่มเติม (ถ้ามี)"
                className={inputClass}
              />
            </Field>
          </div>
        </Card>

        <Card className="p-5 sm:p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-brand-800">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-100 text-xs">4</span>
            ผู้ที่เกี่ยวข้อง (รับแจ้งเตือน LINE)
          </h3>
          <RelatedPeoplePicker
            value={form.related_line_user_ids}
            onChange={(next) => update('related_line_user_ids', next)}
          />
        </Card>

        <Card className={`border-2 p-5 sm:p-6 ${special ? 'border-amber-200 bg-amber-50/40' : 'border-brand-200 bg-brand-50/40'}`}>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
            <span>{special ? '⚠️' : '✅'}</span>
            ตรวจสอบความถูกต้องและเงื่อนไขการอนุมัติ
          </h3>
          {special ? (
            <div className="mt-3 space-y-2 text-sm text-amber-800">
              <p className="font-semibold">ต้องเสนอ ผอ.เขตลาดพร้าว พิจารณาอนุมัติ</p>
              <p className="text-xs leading-relaxed">
                เนื่องจากเดินทางในเวลานอกราชการ นอกพื้นที่กรุงเทพมหานคร หรือตรงกับวันหยุด
                จึงต้องให้ ผอ.เขตลาดพร้าว ลงนามอนุมัติก่อน (ปฏิบัติราชการแทน ปลัดกรุงเทพมหานคร)
                หลังลงนามอนุมัติแล้ว เจ้าหน้าที่จะนำคำขอเข้าจัดสรรรถให้ต่อไป
              </p>
              <p className="text-xs">ระหว่างรอลงนาม รายการจะยังไม่แสดงในปฏิทินคิวรถสาธารณะ</p>
            </div>
          ) : (
            <div className="mt-3 space-y-2 text-sm text-brand-800">
              <p className="font-semibold">อยู่ในเงื่อนไขที่หัวหน้าฝ่ายการศึกษาพิจารณาอนุมัติได้</p>
              <p className="text-xs leading-relaxed">
                เดินทางในเวลาราชการ 08:00 – 16:00 น. ภายในกรุงเทพมหานคร
                และไม่เป็นวันเสาร์-อาทิตย์หรือวันหยุดนักขัตฤกษ์
                โดยหัวหน้าฝ่ายการศึกษา ปฏิบัติราชการแทน ผอ.เขตลาดพร้าว
              </p>
              <p className="text-xs">สถานะเริ่มต้น: รอตรวจสอบ และจะล็อกคิวทันทีเมื่ออนุมัติ</p>
            </div>
          )}
        </Card>

        {serverError ? <Alert tone="danger">{serverError}</Alert> : null}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-xl bg-brand-700 px-4 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? 'กำลังบันทึกคำขอ...' : 'ส่งคำขอใช้รถ'}
        </button>
        <p className="text-center text-xs text-slate-400">
          เมื่อส่งแล้ว ระบบจะแจ้งเตือนสถานะผ่าน LINE ตามขั้นตอนที่กำหนด
        </p>
      </form>
    </div>
  )
}

const inputClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100'

function Field({ label, required, error, children, className }) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
        {required ? <span className="ml-0.5 text-rose-500">*</span> : null}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}
