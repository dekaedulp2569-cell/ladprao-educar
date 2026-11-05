import { useMemo, useState } from 'react'
import { bangkokParts, carTypeDisplay, THAI_MONTHS_LONG, toThaiDigits } from '../lib/helpers'
import { openForm3PrintWindow } from '../lib/printForm3'

export function OfficialCarFormModal({ open, onClose, request, car, driver }) {
  const [recipientSelection, setRecipientSelection] = useState(null)
  const defaultRecipient =
    request?.approval_type === 'district_director' || request?.is_out_of_bkk || request?.is_out_of_hours
      ? 'ปลัดกรุงเทพมหานคร'
      : 'ผู้อำนวยการเขตลาดพร้าว'
  const recipient =
    recipientSelection && recipientSelection.request === request
      ? recipientSelection.value
      : defaultRecipient

  // แยกส่วนประกอบวันเวลาไทย
  const reqParts = useMemo(
    () => bangkokParts(request?.request_date || request?.created_at),
    [request?.request_date, request?.created_at],
  )
  const startParts = useMemo(() => bangkokParts(request?.start_datetime), [request?.start_datetime])
  const endParts = useMemo(() => bangkokParts(request?.end_datetime), [request?.end_datetime])

  if (!open || !request) return null

  const handlePrint = () => {
    openForm3PrintWindow(request, car, driver, recipient)
  }

  const reqDay = reqParts ? toThaiDigits(Number(reqParts.day)) : '..........'
  const reqMonth = reqParts ? THAI_MONTHS_LONG[reqParts.month - 1] : '....................'
  const reqYear = reqParts ? toThaiDigits(reqParts.year) : '..........'

  const startDay = startParts ? toThaiDigits(Number(startParts.day)) : '..........'
  const startMonth = startParts ? THAI_MONTHS_LONG[startParts.month - 1] : '....................'
  const startYear = startParts ? toThaiDigits(startParts.year) : '..........'
  const startTime = startParts ? toThaiDigits(`${startParts.hour}.${startParts.minute}`) : '..........'

  const endDay = endParts ? toThaiDigits(Number(endParts.day)) : '..........'
  const endMonth = endParts ? THAI_MONTHS_LONG[endParts.month - 1] : '....................'
  const endYear = endParts ? toThaiDigits(endParts.year) : '..........'
  const endTime = endParts ? toThaiDigits(`${endParts.hour}.${endParts.minute}`) : '..........'

  const passengerCount = toThaiDigits(request.passenger_count || 1)
  const carPlate = toThaiDigits(car?.license_plate || request.external_car_info || '')
  const carTypeLabel = car ? carTypeDisplay(car.car_type) : 'รถตู้'
  const driverName = driver?.full_name || request.external_driver_name || ''

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 p-2 sm:p-4 print:static print:p-0 print:bg-white">
      {/* ส่วนควบคุม Modal (ซ่อนตอนพิมพ์) */}
      <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-100 text-lg">📄</span>
          <div>
            <h3 className="text-sm font-bold text-slate-800 sm:text-base">แบบ ๓ ใบขออนุญาตใช้รถส่วนกลาง</h3>
            <p className="text-xs text-slate-500">เอกสารสำหรับลงนามสั่งใช้รถตามระเบียบกรุงเทพมหานคร (เลขไทยทั้งหมด)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={recipient}
            onChange={(e) => setRecipientSelection({ request, value: e.target.value })}
            className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ผู้อำนวยการเขตลาดพร้าว">เรียน: ผู้อำนวยการเขตลาดพร้าว</option>
            <option value="ปลัดกรุงเทพมหานคร">เรียน: ปลัดกรุงเทพมหานคร</option>
          </select>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg bg-brand-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800"
          >
            🖨️ เปิดหน้าพิมพ์ A4 (แท็บใหม่)
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            ✕ ปิด
          </button>
        </div>
      </div>

      {/* แผ่นกระดาษเอกสาร A4 จำลอง */}
      <div className="printable-document mx-auto max-w-[210mm] rounded-xl border border-slate-200 bg-white p-8 text-black shadow-2xl sm:p-12 print:m-0 print:max-w-none print:rounded-none print:border-none print:p-0 print:shadow-none font-['Sarabun',sans-serif]">
        {/* หัวกระดาษ */}
        <div className="flex justify-end text-base font-bold">
          <span>แบบ ๓</span>
        </div>

        <div className="mt-4 text-center">
          <h1 className="text-2xl font-bold tracking-wide">ใบขออนุญาตใช้รถส่วนกลาง</h1>
        </div>

        {/* วันที่ เดือน พ.ศ. */}
        <div className="mt-4 flex justify-end text-base">
          <div className="flex items-baseline gap-2">
            <span>วันที่</span>
            <span className="min-w-[3rem] border-b border-dotted border-slate-700 text-center font-semibold">
              {reqDay}
            </span>
            <span>เดือน</span>
            <span className="min-w-[6rem] border-b border-dotted border-slate-700 text-center font-semibold">
              {reqMonth}
            </span>
            <span>พ.ศ.</span>
            <span className="min-w-[4rem] border-b border-dotted border-slate-700 text-center font-semibold">
              {reqYear}
            </span>
          </div>
        </div>

        {/* เรียน */}
        <div className="mt-6 text-base">
          <p className="flex items-baseline gap-2">
            <span className="font-semibold">เรียน</span>
            <span className="font-semibold text-slate-900">{recipient}</span>
          </p>
        </div>

        {/* ข้าพเจ้า / ตำแหน่ง / สังกัด */}
        <div className="mt-4 space-y-3 text-base leading-loose">
          <div className="flex flex-wrap items-baseline gap-2 pl-8 sm:pl-12">
            <span>ข้าพเจ้า</span>
            <span className="min-w-[14rem] flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {request.requester_name || '................................................................'}
            </span>
            <span>ตำแหน่ง</span>
            <span className="min-w-[12rem] flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {request.requester_position || '................................................................'}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span>สังกัด</span>
            <span className="flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {request.requester_department || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว'}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span>ขออนุญาตใช้รถ (ไปที่ไหน)</span>
            <span className="flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {request.destination} {request.destination_province ? `(${request.destination_province})` : ''}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span>เพื่อ</span>
            <span className="min-w-[15rem] flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {request.purpose || '................................................................................................................'}
            </span>
            <span>มีคนนั่ง</span>
            <span className="min-w-[3.5rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {passengerCount}
            </span>
            <span>คน</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span>ในวันที่</span>
            <span className="min-w-[3rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {startDay}
            </span>
            <span>เดือน</span>
            <span className="min-w-[6rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {startMonth}
            </span>
            <span>พ.ศ.</span>
            <span className="min-w-[4rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {startYear}
            </span>
            <span>เวลา</span>
            <span className="min-w-[4rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {startTime}
            </span>
            <span>น.</span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span>ถึงวันที่</span>
            <span className="min-w-[3rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {endDay}
            </span>
            <span>เดือน</span>
            <span className="min-w-[6rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {endMonth}
            </span>
            <span>พ.ศ.</span>
            <span className="min-w-[4rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {endYear}
            </span>
            <span>เวลา</span>
            <span className="min-w-[4rem] border-b border-dotted border-slate-700 text-center font-semibold text-slate-900">
              {endTime}
            </span>
            <span>น.</span>
          </div>
        </div>

        {/* ผู้ขออนุญาต ลงชื่อ */}
        <div className="mt-8 flex justify-end text-base">
          <div className="w-72 text-center leading-loose">
            <p>
              (ลงชื่อ)............................................................ผู้ขออนุญาต
            </p>
            <p className="mt-1">
              (&nbsp;<span className="font-semibold text-slate-900">{request.requester_name || '............................................................'}</span>&nbsp;)
            </p>
          </div>
        </div>

        {/* ส่วนจัดสรรรถยนต์และพนักงานขับรถ */}
        <div className="mt-8 space-y-3 text-base leading-loose">
          <div className="flex flex-wrap items-baseline gap-2">
            <span>รถยนต์</span>
            <span className="min-w-[8rem] border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {carTypeLabel}
            </span>
            <span>หมายเลขทะเบียน</span>
            <span className="min-w-[10rem] flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {carPlate || '............................................................'}
            </span>
          </div>

          <div className="flex flex-wrap items-baseline gap-2">
            <span>พนักงานขับรถยนต์</span>
            <span className="flex-1 border-b border-dotted border-slate-700 px-2 font-semibold text-slate-900">
              {driverName || '............................................................'}
            </span>
          </div>
        </div>

        {/* ลงชื่อ หัวหน้าฝ่ายหรือผู้แทน */}
        <div className="mt-6 flex justify-end text-base">
          <div className="w-80 text-center leading-loose">
            <p>
              ลงชื่อ............................................................หัวหน้าฝ่ายหรือผู้แทน
            </p>
            <p className="mt-1">
              (............................................................)
            </p>
            <p className="mt-1 text-sm text-slate-600">
              ............../............../.............. (วัน เดือน ปี)
            </p>
          </div>
        </div>

        {/* คำสั่งอนุญาต */}
        <div className="mt-8 rounded-lg border border-slate-300 p-4 print:border-none print:p-0">
          <p className="font-bold text-base">คำสั่ง:</p>
          <p className="mt-2 text-base indent-8">
            อนุญาต และพนักงานขับรถยนต์จัดทำแบบรายงานการใช้รถ (แบบ ๔) ให้เรียบร้อยด้วย
          </p>

          <div className="mt-6 flex justify-end text-base">
            <div className="w-80 text-center leading-loose">
              <p>
                (ลงนามผู้มีอำนาจสั่งใช้รถ)............................................................
              </p>
              <p className="mt-1">
                (............................................................)
              </p>
              <p className="mt-1 text-sm text-slate-600">
                ............../............../.............. (วัน เดือน ปี)
              </p>
            </div>
          </div>
        </div>

        {/* หมายเหตุท้ายเอกสาร */}
        <div className="mt-6 border-t border-slate-200 pt-3 text-[11px] text-slate-400 print:text-[10px] print:text-slate-500">
          <p>เลขที่คำขอ: {toThaiDigits(request.doc_number || '-')} · ระบบขอใช้รถและจัดสรรคิวรถ ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว</p>
        </div>
      </div>
    </div>
  )
}
