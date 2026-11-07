import {
  bangkokParts,
  carTypeDisplay,
  formatDestinationWithProvince,
  THAI_MONTHS_LONG,
  toThaiDigits,
} from './helpers.js'

const OUT_OF_HOURS_RECIPIENT = 'ปลัดกรุงเทพมหานคร'
const BUSINESS_HOURS_RECIPIENT = 'ผู้อำนวยการเขตลาดพร้าว'

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function printable(value) {
  if (value === null || value === undefined || value === '') return ''
  return escapeHtml(toThaiDigits(value))
}

/** นับจำนวนอักขระที่ใช้ความกว้างจริง (ตัดสระบน-ล่าง และวรรณยุกต์ออก) */
export function countVisibleChars(str) {
  if (!str) return 0
  return String(str).replace(/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/g, '').length
}

/**
 * ตัดแบ่งข้อความเป็น ๒ บรรทัดตามหลักเอกสารราชการ
 * ถ้ามี \n จะตัดตามบรรทัดที่ผู้ใช้เคาะไว้
 * ถ้าไม่มี จะคำนวณความกว้างอักขระจริงเพื่อตัดแบ่งให้อยู่ใน ๒ บรรทัดพอดี
 */
export function splitTextTwoLines(text, maxVisibleLine1 = 52) {
  if (!text) return { line1: '', line2: '' }
  const raw = String(text).trim()
  if (raw.includes('\n')) {
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    return {
      line1: lines[0] || '',
      line2: lines.slice(1).join(' ') || '',
    }
  }
  if (countVisibleChars(raw) <= maxVisibleLine1) {
    return { line1: raw, line2: '' }
  }

  let visibleCount = 0
  let splitIndex = raw.length
  let lastSpaceIdx = -1

  for (let i = 0; i < raw.length; i++) {
    const char = raw[i]
    if (!/[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/.test(char)) {
      visibleCount++
    }
    if (char === ' ') {
      lastSpaceIdx = i
    }
    if (visibleCount >= maxVisibleLine1) {
      if (lastSpaceIdx > 0 && (visibleCount - countVisibleChars(raw.slice(0, lastSpaceIdx))) < 25) {
        splitIndex = lastSpaceIdx
      } else {
        splitIndex = i + 1
      }
      break
    }
  }

  return {
    line1: raw.substring(0, splitIndex).trim(),
    line2: raw.substring(splitIndex).trim(),
  }
}

function dateValue(parts) {
  if (!parts) {
    return { day: '', month: '', year: '', time: '' }
  }
  return {
    day: toThaiDigits(Number(parts.day)),
    month: THAI_MONTHS_LONG[parts.month - 1],
    year: toThaiDigits(parts.year),
    time: toThaiDigits(`${parts.hour}.${parts.minute}`),
  }
}

export function generateForm3Html(request, car, driver, recipient) {
  if (!request) return ''

  const requestedOn = dateValue(
    bangkokParts(request.request_date || request.created_at || new Date()),
  )
  const startsAt = dateValue(bangkokParts(request.start_datetime))
  const endsAt = dateValue(bangkokParts(request.end_datetime))
  const isSpecialApproval =
    request.approval_type === 'district_director' || request.is_out_of_bkk || request.is_out_of_hours
  const selectedRecipient =
    recipient || (isSpecialApproval ? OUT_OF_HOURS_RECIPIENT : BUSINESS_HOURS_RECIPIENT)

  const requesterName = printable(request.requester_name || '')
  const requesterPosition = printable(request.requester_position || '')
  const requesterDepartment = printable(
    request.requester_department || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
  )

  const destFull = formatDestinationWithProvince(
    request.destination,
    request.destination_province,
  )
  const destLines = splitTextTwoLines(toThaiDigits(destFull), 52)
  const destLine1 = escapeHtml(destLines.line1)
  const destLine2 = escapeHtml(destLines.line2)
  const isDestLong = countVisibleChars(destFull) > 45

  const purposeFull = request.purpose || ''
  const purposeLines = splitTextTwoLines(toThaiDigits(purposeFull), 85)
  const purposeLine1 = escapeHtml(purposeLines.line1)
  const purposeLine2 = escapeHtml(purposeLines.line2)
  const isPurposeLong = countVisibleChars(purposeFull) > 65

  const passengerCount = printable(request.passenger_count || 1)
  const carTypeRaw = car
    ? carTypeDisplay(car.car_type)
    : (request.car_type ? carTypeDisplay(request.car_type) : '-')
  const carType = printable(carTypeRaw)
  const isCarTypeLong = countVisibleChars(carTypeRaw) > 14

  const carPlate = printable(car?.license_plate || request.external_car_info || '')
  const driverName = printable(driver?.full_name || request.external_driver_name || '')

  const startDateStr = startsAt.day ? `${startsAt.day} ${startsAt.month} ${startsAt.year}` : ''
  const endDateStr = endsAt.day ? `${endsAt.day} ${endsAt.month} ${endsAt.year}` : ''

  return `<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>แบบ ๓ ใบขออนุญาตใช้รถส่วนกลาง</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    * { box-sizing: border-box; }

    html, body {
      margin: 0;
      padding: 0;
      background: #525659;
      color: #000;
      font-family: "TH Sarabun New", "TH SarabunPSK", "Sarabun", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .toolbar {
      position: sticky; top: 0; z-index: 100;
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; padding: 10px 24px;
      background: #1e293b; color: #fff;
      box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    }
    .toolbar-info { display: flex; align-items: center; gap: 10px; font-size: 14px; }
    .toolbar-badge {
      display: inline-block; padding: 2px 8px; background: #047857;
      border-radius: 6px; font-size: 12px; font-weight: 600;
    }
    .toolbar-actions { display: flex; align-items: center; gap: 8px; }
    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 16px; border-radius: 6px; font-size: 13px;
      font-weight: 600; cursor: pointer; border: none; font-family: inherit;
    }
    .btn-primary { background: #059669; color: #fff; }
    .btn-primary:hover { background: #047857; }
    .btn-secondary { background: #475569; color: #fff; }
    .btn-secondary:hover { background: #334155; }

    .a4-container { padding: 24px 0 48px; display: flex; justify-content: center; }

    .a4-page {
      width: 210mm; height: 297mm; max-height: 297mm;
      background: #fff; margin: 0 auto;
      padding: 15mm 20mm 12mm 25mm;
      box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      position: relative;
      font-size: 16pt; line-height: 1.4;
      overflow: hidden;
      break-after: avoid-page; page-break-after: avoid;
    }

    .form-number {
      text-align: right; font-weight: 700; font-size: 16pt;
      line-height: 1; margin-bottom: 1mm;
    }
    .form-title {
      text-align: center; font-weight: 700; font-size: 20pt;
      line-height: 1.2; margin: 0 0 2mm 0;
    }

    .form-row {
      display: flex; align-items: baseline;
      min-height: 7mm; line-height: 1.4; margin: 0;
    }
    .row-label { white-space: nowrap; flex: none; }

    .dotted-fill {
      flex: 1; min-width: 0;
      border-bottom: 1px dotted #000;
      padding: 0 4px 1px 4px; line-height: 1.2;
    }
    .dotted-field {
      display: inline-block;
      border-bottom: 1px dotted #000;
      padding: 0 4px 1px 4px; line-height: 1.2; flex: none;
    }
    .dotted-line {
      display: inline-block;
      border-bottom: 1px dotted #000;
      height: 1em; flex: none;
    }

    .font-15pt { font-size: 15pt !important; }
    .indent-gov { padding-left: 25mm; }

    .top-date-row {
      display: flex; align-items: baseline;
      margin-left: 50%; margin-bottom: 1mm; min-height: 7mm;
    }

    /* ส่วนลายเซ็นผู้ขออนุญาต: เว้น 1 บรรทัด, ชื่อในวงเล็บ, ตำแหน่ง, สังกัด อยู่กึ่งกลางเส้นประ (ไม่มีเส้นประใต้ตำแหน่ง/สังกัด) */
    .requester-sig-block {
      margin-top: 7mm;
      display: flex; justify-content: flex-end; width: 100%;
    }
    .requester-sig-col {
      display: flex; flex-direction: column; align-items: flex-end;
    }
    .requester-sig-top {
      display: flex; align-items: baseline;
      justify-content: flex-end; white-space: nowrap;
    }
    .requester-sig-sub {
      width: 60mm; margin-right: 22mm;
      text-align: center; margin-top: 0.5mm; line-height: 1.3;
    }

    /* หัวหน้าฝ่าย: เว้น 3 บรรทัดก่อนวันเดือนปี และวันเดือนปีอยู่กึ่งกลางเส้นประพอดี */
    .head-sig-block {
      margin-top: 8mm; margin-left: 42%; width: 58%;
      position: relative; min-height: 23mm;
    }
    .head-sig-block .sig-row {
      display: flex; align-items: baseline; width: 100%;
    }

    .sig-line-wrap {
      position: relative;
      flex: 1;
      display: flex;
      align-items: baseline;
      margin: 0 4px;
    }
    .sig-fill {
      width: 100%; height: 1.2em;
      border-bottom: 1px dotted #000; display: block;
    }
    .sig-date-centered {
      position: absolute;
      top: 14mm;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: baseline;
      justify-content: center;
      white-space: nowrap;
    }
    .date-slot {
      display: inline-block; width: 14mm;
      border-bottom: 1px dotted #000; margin: 0 1.5mm;
    }

    .order-block {
      margin-top: 6mm; text-align: center;
      font-size: 16pt; line-height: 1.4; font-weight: 700;
    }

    /* ผู้มีอำนาจสั่งใช้รถ: เว้น 3 บรรทัดก่อนวันเดือนปี และวันเดือนปีอยู่กึ่งกลางเส้นประพอดี */
    .auth-sig-block {
      margin-top: 8mm; margin-left: 36%; width: 64%;
      position: relative; min-height: 23mm;
    }
    .auth-sig-block .sig-row {
      display: flex; align-items: baseline; width: 100%;
    }

    .text-center { text-align: center; }
    .text-left { text-align: left; }

    @media print {
      html, body {
        width: 210mm; height: 297mm;
        background: #fff !important;
        margin: 0 !important; padding: 0 !important;
      }
      .no-print { display: none !important; }
      .a4-container { padding: 0 !important; margin: 0 !important; }
      .a4-page {
        width: 210mm !important; height: 297mm !important;
        max-height: 297mm !important;
        margin: 0 !important;
        padding: 15mm 20mm 12mm 25mm !important;
        box-shadow: none !important; border: none !important;
        break-after: avoid-page !important;
        page-break-after: avoid !important;
      }
    }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <div class="toolbar-info">
      <span class="toolbar-badge">A4 Portrait</span>
      <span>แบบ ๓ ใบขออนุญาตใช้รถส่วนกลาง</span>
    </div>
    <div class="toolbar-actions">
      <button class="btn btn-primary" onclick="window.print()">🖨️ พิมพ์เอกสาร (Print / PDF)</button>
      <button class="btn btn-secondary" onclick="window.close()">✕ ปิด</button>
    </div>
  </div>

  <div class="a4-container">
    <main class="a4-page">
      <div class="form-number">แบบ ๓</div>
      <h1 class="form-title">ใบขออนุญาตใช้รถส่วนกลาง</h1>

      <div class="top-date-row">
        <span class="row-label">วันที่</span>
        <span class="dotted-field text-center" style="width:14mm">${requestedOn.day || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:6px">เดือน</span>
        <span class="dotted-field text-center" style="width:28mm">${requestedOn.month || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:6px">พ.ศ.</span>
        <span class="dotted-field text-center" style="width:18mm">${requestedOn.year || '&nbsp;'}</span>
      </div>

      <div class="form-row" style="margin-bottom:1mm">
        <span class="row-label">เรียน</span>
        <span class="row-label" style="margin-left:10px">${printable(selectedRecipient)}</span>
      </div>

      <div class="form-row indent-gov">
        <span class="row-label">ข้าพเจ้า</span>
        <span class="dotted-fill text-center" style="flex:1.1">${requesterName || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:8px">ตำแหน่ง</span>
        <span class="dotted-fill text-center" style="flex:1">${requesterPosition || '&nbsp;'}</span>
      </div>

      <div class="form-row ${isDestLong ? 'font-15pt' : ''}">
        <span class="row-label">ขออนุญาตใช้รถ (ไปที่ไหน)</span>
        <span class="dotted-fill text-left">${destLine1 || '&nbsp;'}</span>
      </div>

      <div class="form-row ${isDestLong ? 'font-15pt' : ''}">
        <span class="dotted-fill text-left">${destLine2 || '&nbsp;'}</span>
      </div>

      <div class="form-row ${isPurposeLong ? 'font-15pt' : ''}">
        <span class="row-label">เพื่อ</span>
        <span class="dotted-fill text-left">${purposeLine1 || '&nbsp;'}</span>
      </div>

      <div class="form-row ${isPurposeLong ? 'font-15pt' : ''}">
        <span class="dotted-fill text-left">${purposeLine2 || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:8px">มีคนนั่ง</span>
        <span class="dotted-field text-center" style="width:16mm">${passengerCount || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:6px">คน</span>
      </div>

      <div class="form-row">
        <span class="row-label">ในวันที่</span>
        <span class="dotted-fill text-center">${startDateStr || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:8px">เวลา</span>
        <span class="dotted-field text-center" style="width:22mm">${startsAt.time || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:6px">น.</span>
      </div>

      <div class="form-row">
        <span class="row-label">ถึงวันที่</span>
        <span class="dotted-fill text-center">${endDateStr || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:8px">เวลา</span>
        <span class="dotted-field text-center" style="width:22mm">${endsAt.time || '&nbsp;'}</span>
        <span class="row-label" style="margin-left:6px">น.</span>
      </div>

      <div class="requester-sig-block">
        <div class="requester-sig-col">
          <div class="requester-sig-top">
            <span class="dotted-line" style="width:60mm">&nbsp;</span>
            <span class="row-label" style="margin-left:6px">ผู้ขออนุญาต</span>
          </div>
          <div class="requester-sig-sub">
            (&nbsp;${requesterName || '............................................................'}&nbsp;)
          </div>
          <div class="requester-sig-sub ${requesterPosition.length > 25 ? 'font-15pt' : ''}">
            ${requesterPosition || '&nbsp;'}
          </div>
          <div class="requester-sig-sub ${requesterDepartment.length > 25 ? 'font-15pt' : ''}">
            ${requesterDepartment || '&nbsp;'}
          </div>
        </div>
      </div>

      <div class="form-row" style="margin-top:5mm">
        <span class="row-label">รถยนต์</span>
        <span class="dotted-field text-center ${isCarTypeLong ? 'font-15pt' : ''}" style="min-width:62mm;flex:1.2">
          ${carType || '-'}
        </span>
        <span class="row-label" style="margin-left:8px">หมายเลขทะเบียน</span>
        <span class="dotted-fill text-center" style="flex:1">${carPlate || '&nbsp;'}</span>
      </div>

      <div class="form-row">
        <span class="row-label">พนักงานขับรถยนต์</span>
        <span class="dotted-fill text-center">${driverName || '&nbsp;'}</span>
      </div>

      <div class="head-sig-block">
        <div class="sig-row">
          <span class="row-label">ลงชื่อ</span>
          <div class="sig-line-wrap">
            <span class="sig-fill">&nbsp;</span>
            <div class="sig-date-centered">
              <span class="date-slot">&nbsp;</span>/
              <span class="date-slot">&nbsp;</span>/
              <span class="date-slot">&nbsp;</span>
              <span class="row-label" style="margin-left:4px">(วัน เดือน ปี)</span>
            </div>
          </div>
          <span class="row-label" style="margin-left:4px">หัวหน้าฝ่ายหรือผู้แทน</span>
        </div>
      </div>

      <div class="order-block">
        <strong>อนุญาต และพนักงานขับรถยนต์จัดทำแบบรายงานการใช้รถ (แบบ ๔) ให้เรียบร้อยด้วย</strong>
      </div>

      <div class="auth-sig-block">
        <div class="sig-row">
          <span class="row-label">(ลงนามผู้มีอำนาจสั่งใช้รถ)</span>
          <div class="sig-line-wrap">
            <span class="sig-fill">&nbsp;</span>
            <div class="sig-date-centered">
              <span class="date-slot">&nbsp;</span>/
              <span class="date-slot">&nbsp;</span>/
              <span class="date-slot">&nbsp;</span>
              <span class="row-label" style="margin-left:4px">(วัน เดือน ปี)</span>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</body>
</html>`
}

export function openForm3PrintWindow(request, car, driver, recipient) {
  if (!request) return

  const html = generateForm3Html(request, car, driver, recipient)
  const win = window.open('', '_blank')
  if (!win) {
    window.alert('กรุณาอนุญาตให้เบราว์เซอร์เปิดหน้าต่างใหม่ (Pop-up) เพื่อพิมพ์เอกสาร')
    return
  }

  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}
