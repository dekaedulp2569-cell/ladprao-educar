import { useMemo, useState } from 'react'
import { bangkokParts, carTypeDisplay, THAI_MONTHS_LONG, toThaiDigits } from '../lib/helpers'
import { countVisibleChars, openForm3PrintWindow, splitTextTwoLines } from '../lib/printForm3'

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
  const destLines = splitTextTwoLines(toThaiDigits(destFull), 52)
  const isDestLong = countVisibleChars(destFull) > 45

  const purposeFull = request.purpose || ''
  const purposeLines = splitTextTwoLines(toThaiDigits(purposeFull), 85)
  const isPurposeLong = countVisibleChars(purposeFull) > 65

  const passengerCount = toThaiDigits(request.passenger_count || 1)
  const carPlate = toThaiDigits(car?.license_plate || request.external_car_info || '')
  const carTypeRaw = car
    ? carTypeDisplay(car.car_type)
    : (request.car_type ? carTypeDisplay(request.car_type) : '-')
  const carTypeLabel = toThaiDigits(carTypeRaw)
  const isCarTypeLong = countVisibleChars(carTypeRaw) > 14

  const driverName = driver?.full_name || request.external_driver_name || ''

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/70 p-2 sm:p-4 print:static print:p-0 print:bg-white">
      {/* ส่วนควบคุม Modal */}
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

      {/* แผ่นกระดาษ A4 จำลอง */}
      <div className="overflow-x-auto pb-8 print:p-0">
        <div
          className="mx-auto bg-white text-black shadow-2xl print:shadow-none"
          style={{
            width: '210mm',
            height: '297mm',
            maxHeight: '297mm',
            overflow: 'hidden',
            padding: '15mm 20mm 12mm 25mm',
            boxSizing: 'border-box',
            fontFamily: '"TH Sarabun New", "TH SarabunPSK", "Sarabun", sans-serif',
            fontSize: '16pt',
            lineHeight: 1.4,
          }}
        >
          <div className="text-right font-bold text-[16pt] leading-none mb-[1mm]">
            แบบ ๓
          </div>

          <h1 className="text-center font-bold text-[20pt] leading-tight mb-[2mm]">
            ใบขออนุญาตใช้รถส่วนกลาง
          </h1>

          <div className="flex items-baseline mb-[1mm] min-h-[7mm]" style={{ marginLeft: '50%' }}>
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

          <div className="flex items-baseline mb-[1mm] min-h-[7mm]">
            <span className="shrink-0 whitespace-nowrap">เรียน</span>
            <span className="ml-[10px]">{recipient}</span>
          </div>

          <div className="flex items-baseline min-h-[7mm]" style={{ paddingLeft: '25mm' }}>
            <span className="shrink-0 whitespace-nowrap">ข้าพเจ้า</span>
            <span className="flex-[1.1] border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {requesterName || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">ตำแหน่ง</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {requesterPosition || '\u00A0'}
            </span>
          </div>

          <div className={`flex items-baseline min-h-[7mm] ${isDestLong ? 'text-[15pt]' : ''}`}>
            <span className="shrink-0 whitespace-nowrap">ขออนุญาตใช้รถ (ไปที่ไหน)</span>
            <span className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0">
              {destLines.line1 || '\u00A0'}
            </span>
          </div>

          <div className={`flex items-baseline min-h-[7mm] ${isDestLong ? 'text-[15pt]' : ''}`}>
            <span className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0">
              {destLines.line2 || '\u00A0'}
            </span>
          </div>

          <div className={`flex items-baseline min-h-[7mm] ${isPurposeLong ? 'text-[15pt]' : ''}`}>
            <span className="shrink-0 whitespace-nowrap">เพื่อ</span>
            <span className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0">
              {purposeLines.line1 || '\u00A0'}
            </span>
          </div>

          <div className={`flex items-baseline min-h-[7mm] ${isPurposeLong ? 'text-[15pt]' : ''}`}>
            <span className="flex-1 border-b border-dotted border-black text-left px-1 pb-[1px] min-w-0">
              {purposeLines.line2 || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">มีคนนั่ง</span>
            <span className="border-b border-dotted border-black text-center px-1 pb-[1px]" style={{ width: '16mm' }}>
              {passengerCount || '\u00A0'}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[6px]">คน</span>
          </div>

          <div className="flex items-baseline min-h-[7mm]">
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

          <div className="flex items-baseline min-h-[7mm]">
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

          {/* ลายเซ็นผู้ขออนุญาต */}
          <div className="flex justify-end w-full mt-[4mm]">
            <div className="flex flex-col items-end">
              <div className="flex items-baseline justify-end whitespace-nowrap">
                <span className="border-b border-dotted border-black inline-block" style={{ width: '60mm', height: '1em' }}>
                  {'\u00A0'}
                </span>
                <span className="shrink-0 whitespace-nowrap ml-[6px]">ผู้ขออนุญาต</span>
              </div>
              <div className="text-center mt-[0.5mm] leading-[1.3]" style={{ width: '60mm', marginRight: '22mm' }}>
                (&nbsp;{requesterName || '............................................................'}&nbsp;)
              </div>
              <div
                className={`text-center mt-[0.5mm] leading-[1.3] ${
                  requesterPosition.length > 25 ? 'text-[15pt]' : ''
                }`}
                style={{ width: '60mm', marginRight: '22mm' }}
              >
                {requesterPosition || '\u00A0'}
              </div>
              <div
                className={`text-center mt-[0.5mm] leading-[1.3] ${
                  requesterDepartment.length > 25 ? 'text-[15pt]' : ''
                }`}
                style={{ width: '60mm', marginRight: '22mm' }}
              >
                {requesterDepartment || '\u00A0'}
              </div>
            </div>
          </div>

          {/* ข้อมูลรถ */}
          <div className="flex items-baseline min-h-[7mm] mt-[5mm]">
            <span className="shrink-0 whitespace-nowrap">รถยนต์</span>
            <span
              className={`border-b border-dotted border-black text-center px-1 pb-[1px] ${
                isCarTypeLong ? 'text-[15pt]' : ''
              }`}
              style={{ minWidth: '62mm', flex: 1.2 }}
            >
              {carTypeLabel}
            </span>
            <span className="shrink-0 whitespace-nowrap ml-[8px]">หมายเลขทะเบียน</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {carPlate || '\u00A0'}
            </span>
          </div>

          <div className="flex items-baseline min-h-[7mm]">
            <span className="shrink-0 whitespace-nowrap">พนักงานขับรถยนต์</span>
            <span className="flex-1 border-b border-dotted border-black text-center px-1 pb-[1px] min-w-0">
              {driverName || '\u00A0'}
            </span>
          </div>

          {/* ลงชื่อหัวหน้าฝ่าย - วันเดือนปีอยู่กึ่งกลางเส้นประลงนามพอดี */}
          <div className="mt-[8mm] relative min-h-[27mm]" style={{ marginLeft: '42%', width: '58%' }}>
            <div className="flex items-baseline w-full">
              <span className="shrink-0 whitespace-nowrap">ลงชื่อ</span>
              <div className="relative flex-1 flex items-baseline mx-[4px]">
                <span className="w-full border-b border-dotted border-black block" style={{ height: '1.2em' }}>
                  {'\u00A0'}
                </span>
                <div
                  className="absolute flex items-baseline justify-center whitespace-nowrap"
                  style={{ top: '18mm', left: '50%', transform: 'translateX(-50%)' }}
                >
                  <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>/
                  <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>/
                  <span className="inline-block border-b border-dotted border-black mx-[1.5mm]" style={{ width: '14mm' }}>{'\u00A0'}</span>
                  <span className="shrink-0 whitespace-nowrap ml-[4px]">(วัน เดือน ปี)</span>
                </div>
              </div>
              <span className="shrink-0 whitespace-nowrap ml-[4px]">หัวหน้าฝ่ายหรือผู้แทน</span>
            </div>
          </div>

          {/* คำสั่ง (ตัวหนา) */}
          <div className="mt-[6mm] text-center text-[16pt] leading-normal font-bold">
            อนุญาต และพนักงานขับรถยนต์จัดทำแบบรายงานการใช้รถ (แบบ ๔) ให้เรียบร้อยด้วย
          </div>

          {/* ลงนามผู้มีอำนาจ - วันเดือนปีอยู่กึ่งกลางเส้นประลงนามพอดี */}
          <div className="mt-[8mm] relative min-h-[27mm]" style={{ marginLeft: '36%', width: '64%' }}>
            <div className="flex items-baseline w-full">
              <span className="shrink-0 whitespace-nowrap">(ลงนามผู้มีอำนาจสั่งใช้รถ)</span>
              <div className="relative flex-1 flex items-baseline mx-[4px]">
                <span className="w-full border-b border-dotted border-black block" style={{ height: '1.2em' }}>
                  {'\u00A0'}
                </span>
                <div
                  className="absolute flex items-baseline justify-center whitespace-nowrap"
                  style={{ top: '18mm', left: '50%', transform: 'translateX(-50%)' }}
                >
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
    </div>
  )
}
