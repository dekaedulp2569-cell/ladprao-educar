import { useMemo, useState } from 'react'
import { bangkokParts, carTypeDisplay, THAI_MONTHS_LONG, toThaiDigits } from '../lib/helpers'
import { openForm3PrintWindow, splitTextTwoLines } from '../lib/printForm3'

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

  const reqDay = reqParts ? toThaiDigits(Number(reqParts.day)) : ''
  const reqMonth = reqParts ? THAI_MONTHS_LONG[reqParts.month - 1] : ''
  const reqYear = reqParts ? toThaiDigits(reqParts.year) : ''

  const startDay = startParts ? toThaiDigits(Number(startParts.day)) : ''
  const startMonth = startParts ? THAI_MONTHS_LONG[startParts.month - 1] : ''
  const startYear = startParts ? toThaiDigits(startParts.year) : ''
  const startTime = startParts ? toThaiDigits(`${startParts.hour}.${startParts.minute}`) : ''

  const endDay = endParts ? toThaiDigits(Number(endParts.day)) : ''
  const endMonth = endParts ? THAI_MONTHS_LONG[endParts.month - 1] : ''
  const endYear = endParts ? toThaiDigits(endParts.year) : ''
  const endTime = endParts ? toThaiDigits(`${endParts.hour}.${endParts.minute}`) : ''

  const startDateStr = startDay ? `${startDay} ${startMonth} ${startYear}` : ''
  const endDateStr = endDay ? `${endDay} ${endMonth} ${endYear}` : ''

  const requesterName = toThaiDigits(request.requester_name || '')
  const requesterPosition = toThaiDigits(request.requester_position || '')
  const requesterDepartment = toThaiDigits(
    request.requester_department || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
  )

  const destFull = [
    request.destination || '',
    request.destination_province ? ` (${request.destination_province})` : '',
  ].join('').trim()
  const destLines = splitTextTwoLines(toThaiDigits(destFull), 56)

  const purposeFull = request.purpose || ''
  const purposeLines = splitTextTwoLines(toThaiDigits(purposeFull), 100)

  const passengerCount = toThaiDigits(request.passenger_count || 1)
  const carPlate = toThaiDigits(car?.license_plate || request.external_car_info || '')
  const carTypeLabel = car
    ? carTypeDisplay(car.car_type)
    : (request.car_type ? carTypeDisplay(request.car_type) : '-')
  const driverName = driver?.full_name || request.external_driver_name || ''

  const formattedPosition = requesterPosition
    ? (requesterPosition.startsWith('ตำแหน่ง') ? requesterPosition : `ตำแหน่ง ${requesterPosition}`)
    : 'ตำแหน่ง............................................................'

  const formattedDepartment = requesterDepartment
    ? (requesterDepartment.startsWith('สังกัด') ? requesterDepartment : `สังกัด ${requesterDepartment}`)
    : 'สังกัด............................................................'

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-2 sm:p-4 print:static print:p-0 print:bg-white">
      {/* ส่วนควบคุม Modal (ซ่อนตอนพิมพ์) */}
      <div className="mx-auto mb-3 flex max-w-4xl items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg print:hidden">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-lg">📄</span>
          <div>
            <h3 className="text-sm font-bold text-slate-800 sm:text-base">แบบ ๓ ใบขออนุญาตใช้รถส่วนกลาง (ขนาด A4)</h3>
            <p className="text-xs text-slate-500">เอกสารสำหรับลงนามสั่งใช้รถตามระเบียบกรุงเทพมหานคร</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={recipient}
            onChange={(e) => setRecipientSelection({ request, value: e.target.value })}
            className="rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          >
            <option value="ผู้อำนวยการเขตลาดพร้าว">เรียน: ผู้อำนวยการเขตลาดพร้าว</option>
            <option value="ปลัดกรุงเทพมหานคร">เรียน: ปลัดกรุงเทพมหานคร</option>
          </select>
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-800"
          >
            🖨️ พิมพ์เอกสาร A4 (แท็บใหม่)
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
      <div className="overflow-x-auto pb-8 print:p-0">
        <div
          className="mx-auto bg-white text-black shadow-2xl print:shadow-none"
          style={{
            width: '210mm',
            minHeight: '297mm',
            padding: '15mm 20mm 14mm 25mm',
            boxSizing: 'border-box',
            fontFamily: '"TH Sarabun New", "TH SarabunPSK", "Sarabun", sans-serif',
            fontSize: '15pt',
            lineHeight: 1.4,
          }}
        >
          {/* มุมขวาบน: แบบ ๓ */}
          <div className="text-right font-bold text-[16pt] leading-none mb-[2mm]">
            แบบ ๓
          </div>

          {/* ชื่อเอกสาร */}
          <h1 className="text-center font-bold text-[20pt] leading-tight mb-[3mm]">
            ใบขออนุญาตใช้รถส่วนกลาง
          </h1>

          {/* วันที่ เดือน พ.ศ. */}
          <div className="flex items-baseline mb-[2mm] min-h-[6.8mm]" style={{ marginLeft: '50%' }}>
            <span className="shrink-0 whitespace-nowrap">วันที่</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '14mm' }}>
              {reqDay || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[6px]">เดือน</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '28mm' }}>
              {reqMonth || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[6px]">พ.ศ.</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '18mm' }}>
              {reqYear || '\u00A0'}
            </span>
          </div>

          {/* เรียน */}
          <div className="flex items-baseline mb-[2mm] min-h-[6.8mm]">
            <span className="shrink-0 whitespace-nowrap">เรียน</span>
            <span className="ml-[10px]">{recipient}</span>
          </div>

          {/* ข้าพเจ้า / ตำแหน่ง */}
          <div className="flex items-baseline min-h-[6.8mm]" style={{ paddingLeft: '25mm' }}>
            <span className="shrink-0 whitespace-nowrap">ข้าพเจ้า</span>
            <span className="flex-[1.1] border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {requesterName || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">ตำแหน่ง</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {requesterPosition || '\u00A0'}
            </span>
          </div>

          {/* ขออนุญาตใช้รถ (ไปที่ไหน) - บรรทัด ๑ */}
          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="shrink-0 whitespace-nowrap">ขออนุญาตใช้รถ (ไปที่ไหน)</span>
            <span
              className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0 truncate"
              style={{ fontSize: (destLines.line1 || '').length > 48 ? '13.5pt' : '15pt', whiteSpace: 'nowrap' }}
            >
              {destLines.line1 || '\u00A0'}
            </span>
          </div>

          {/* ขออนุญาตใช้รถ (ไปที่ไหน) - บรรทัด ๒ */}
          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0" style={{ whiteSpace: 'nowrap' }}>
              {destLines.line2 || '\u00A0'}
            </span>
          </div>

          {/* เพื่อ - บรรทัด ๑ */}
          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="shrink-0 whitespace-nowrap">เพื่อ</span>
            <span
              className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0"
              style={{ fontSize: (purposeLines.line1 || '').length > 70 ? '13.5pt' : '15pt', whiteSpace: 'nowrap' }}
            >
              {purposeLines.line1 || '\u00A0'}
            </span>
          </div>

          {/* เพื่อ - บรรทัด ๒ + มีคนนั่ง ... คน */}
          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0" style={{ whiteSpace: 'nowrap' }}>
              {purposeLines.line2 || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">มีคนนั่ง</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '16mm' }}>
              {passengerCount || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[6px]">คน</span>
          </div>

          {/* ในวันที่ ... เวลา ... น. */}
          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="shrink-0 whitespace-nowrap">ในวันที่</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {startDateStr || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">เวลา</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '22mm' }}>
              {startTime || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[6px]">น.</span>
          </div>

          {/* ถึงวันที่ ... เวลา ... น. */}
          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="shrink-0 whitespace-nowrap">ถึงวันที่</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {endDateStr || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">เวลา</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '22mm' }}>
              {endTime || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[6px]">น.</span>
          </div>

          {/* ลายเซ็นผู้ขออนุญาต และชื่อ ตำแหน่ง สังกัด */}
          <div className="flex justify-end w-full mt-[5mm]">
            <div className="inline-flex flex-col items-center text-center" style={{ width: '88mm' }}>
              <div className="flex items-baseline justify-end w-full">
                <span className="border-b border-dotted border-black inline-block" style={{ width: '58mm', height: '1em' }}>
                  {'\u00A0'}
                </span>
                <span className="shrink-0 whitespace-nowrap ml-[6px]">ผู้ขออนุญาต</span>
              </div>
              <div className="mt-[1mm] text-[14pt] leading-tight text-center w-full whitespace-nowrap">
                (&nbsp;{requesterName || '............................................................'}&nbsp;)
              </div>
              <div className="mt-[1mm] text-[14pt] leading-tight text-center w-full whitespace-nowrap">
                {formattedPosition}
              </div>
              <div className="mt-[1mm] text-[14pt] leading-tight text-center w-full whitespace-nowrap">
                {formattedDepartment}
              </div>
            </div>
          </div>

          {/* ส่วนระบุรถและพนักงานขับรถ */}
          <div className="flex items-baseline min-h-[6.8mm] mt-[5mm]">
            <span className="shrink-0 whitespace-nowrap">รถยนต์</span>
            <span
              className="border-b border-dotted border-black text-center px-1 pb-[1px]"
              style={{
                width: '62mm',
                minWidth: '62mm',
                fontSize: (carTypeLabel || '').length > 20 ? '13.5pt' : '15pt',
                whiteSpace: 'nowrap',
              }}
            >
              {carTypeLabel}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">หมายเลขทะเบียน</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {carPlate || '\u00A0'}
            </span>
          </div>

          <div className="flex items-baseline min-h-[6.8mm]">
            <span className="shrink-0 whitespace-nowrap">พนักงานขับรถยนต์</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {driverName || '\u00A0'}
            </span>
          </div>

          {/* ส่วนลงชื่อหัวหน้าฝ่าย */}
          <div className="mt-[5mm]" style={{ marginLeft: '45%', width: '55%' }}>
            <div className="flex items-baseline w-full">
              <span className="shrink-0 whitespace-nowrap">ลงชื่อ</span>
              <span className="flex-1 border-b border-dotted border-black inline-block" style={{ height: '1em' }}>
                {'\u00A0'}
              </span>
              <span className="shrink-0 whitespace-nowrap ml-[4px]">หัวหน้าฝ่ายหรือผู้แทน</span>
            </div>
            <div className="flex items-baseline w-full mt-[13mm]">
              <span className="shrink-0 whitespace-nowrap invisible">ลงชื่อ</span>
              <div className="flex-1 flex items-baseline justify-center whitespace-nowrap">
                <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>/
                <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>/
                <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>
                <span className="shrink-0 whitespace-nowrap ml-[4px]">(วัน เดือน ปี)</span>
              </div>
              <span className="shrink-0 whitespace-nowrap invisible ml-[4px]">หัวหน้าฝ่ายหรือผู้แทน</span>
            </div>
          </div>

          {/* ข้อความคำสั่ง (ตัวหนา) */}
          <div className="mt-[5mm] text-center text-[15.5pt] leading-normal font-bold">
            อนุญาต และพนักงานขับรถยนต์จัดทำแบบรายงานการใช้รถ (แบบ ๔) ให้เรียบร้อยด้วย
          </div>

          {/* ส่วนลงนามผู้มีอำนาจสั่งใช้รถ */}
          <div className="mt-[5mm]" style={{ marginLeft: '35%', width: '65%' }}>
            <div className="flex items-baseline w-full">
              <span className="shrink-0 whitespace-nowrap">(ลงนามผู้มีอำนาจสั่งใช้รถ)</span>
              <span className="flex-1 border-b border-dotted border-black inline-block" style={{ height: '1em' }}>
                {'\u00A0'}
              </span>
            </div>
            <div className="flex items-baseline w-full mt-[13mm]">
              <span className="shrink-0 whitespace-nowrap invisible">(ลงนามผู้มีอำนาจสั่งใช้รถ)</span>
              <div className="flex-1 flex items-baseline justify-center whitespace-nowrap">
                <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>/
                <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>/
                <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>
                <span className="shrink-0 whitespace-nowrap ml-[4px]">(วัน เดือน ปี)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
