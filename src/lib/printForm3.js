import { bangkokParts, carTypeDisplay, THAI_MONTHS_LONG, toThaiDigits } from './helpers.js'

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
  return escapeHtml(toThaiDigits(value))
}

function dateValue(parts) {
  if (!parts) {
    return { day: '..........', month: '....................', year: '..........', time: '..........' }
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
  const destination = printable(request.destination || '')
  const province = request.destination_province ? ` (${printable(request.destination_province)})` : ''
  const purpose = printable(request.purpose || '')
  const passengerCount = printable(request.passenger_count || 1)
  const carType = printable(car ? carTypeDisplay(car.car_type) : 'รถตู้')
  const carPlate = printable(car?.license_plate || request.external_car_info || '')
  const driverName = printable(driver?.full_name || request.external_driver_name || '')

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

    * {
      box-sizing: border-box;
    }

    html,
    body {
      margin: 0;
      min-height: 100%;
      background: #fff;
      color: #000;
      font-family: "TH Sarabun New", "TH SarabunPSK", "Sarabun", sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    .a4-page {
      width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 8mm 15mm 10mm 15mm;
      font-size: 14pt;
      font-weight: 400;
      line-height: 1.2;
    }

    .form-number {
      text-align: right;
      font-weight: 700;
      line-height: 1;
      margin-bottom: 3mm;
    }

    .title {
      margin: 3mm 0 4mm;
      text-align: center;
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.2;
    }

    .request-date {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 1mm;
      margin: 0 0 5mm;
      text-align: right;
      white-space: nowrap;
    }

    .date-field {
      display: inline-block;
      min-width: 12mm;
      padding: 0 1mm 0.5mm;
      border-bottom: 1px dotted #000;
      text-align: center;
      white-space: nowrap;
    }

    .date-field.month {
      min-width: 26mm;
    }

    .date-field.year {
      min-width: 20mm;
    }

    .recipient {
      margin: 0 0 5mm;
    }

    .details {
      margin-top: 6mm;
    }

    .detail-row {
      min-height: 7mm;
      margin: 0;
      line-height: 1.3;
      display: flex;
      align-items: baseline;
      gap: 1mm;
      flex-wrap: wrap;
    }

    .field-line {
      display: inline-block;
      min-width: 0;
      padding: 0 1mm 0.5mm;
      border-bottom: 1px dotted #000;
      text-align: left;
      white-space: normal;
      word-break: break-word;
    }

    .destination-line,
    .purpose-line,
    .travel-date-line,
    .license-plate-line {
      flex: 1;
    }

    .passenger-line {
      width: 14mm;
    }

    .vehicle-type-line {
      width: 42mm;
    }

    .travel-time-line {
      width: 19mm;
    }

    .requester-identity {
      display: flex;
      align-items: baseline;
      gap: 1mm;
      padding-left: 20mm;
      flex-wrap: wrap;
      white-space: normal;
    }

    .requester-name-group,
    .requester-position-group {
      display: flex;
      align-items: baseline;
      gap: 1mm;
      min-width: 0;
    }

    .requester-name-group {
      flex: 1.05;
    }

    .requester-position-group {
      flex: 0.95;
    }

    .requester-name-line,
    .requester-position-line {
      flex: 1;
    }

    .signature {
      width: max-content;
      max-width: 100%;
      margin-left: auto;
      text-align: center;
      line-height: 1.4;
    }

    .signature-line {
      display: flex;
      align-items: baseline;
      width: 100%;
      white-space: nowrap;
    }

    .signature-leader {
      flex: 1;
      min-width: 4mm;
      margin: 0 1mm;
      border-bottom: 1px dotted #000;
    }

    .requester-signature {
      margin-top: 10mm;
      margin-bottom: 0;
    }

    .review-signature {
      width: 98mm;
      margin-top: 8mm;
      margin-bottom: 0;
      text-align: left;
    }

    .review-signature .signature-date {
      width: 82mm;
      margin-right: auto;
      margin-left: auto !important;
    }

    .authority-signature {
      width: 160mm;
      margin-top: 8mm;
      margin-bottom: 0;
      text-align: left;
    }

    .authority-signature .signature-line {
      width: 110mm;
      margin-left: auto;
    }

    .authority-signature .signature-date {
      width: 82mm;
    }

    .approval-order {
      margin: 24mm 0 0;
      text-align: center;
      font-weight: 700;
    }

    .signature p {
      margin: 0;
    }

    .vehicle {
      margin-top: 5mm;
    }

    .vehicle p {
      margin: 0;
      min-height: 7.4mm;
      line-height: 1.3;
    }

    .vehicle-type-line,
    .license-plate-line {
      padding-bottom: 0;
    }

    .vehicle .driver-row {
      margin-top: 1mm;
    }

    .signature-date {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      width: 100mm;
      margin-left: auto !important;
      margin-top: calc(3 * 1.4em) !important;
      white-space: nowrap;
    }

    .signature-date-spacer {
      display: inline-block;
      flex: 0 0 7ch;
      width: 7ch;
      height: 1.4em;
      box-sizing: border-box;
      border-bottom: 1px dotted #000;
    }

    .signature-date-rule {
      display: flex;
      align-items: baseline;
      flex: 0 0 auto;
      line-height: 1.4;
    }

    .signature-date-label {
      flex: 0 0 auto;
      padding-left: 1mm;
    }

    @media screen {
      body {
        background: #f1f5f9;
      }

      .a4-page {
        background: #fff;
        box-shadow: 0 2mm 8mm rgb(15 23 42 / 12%);
      }
    }

    @media print {
      html,
      body {
        width: 210mm;
        height: 297mm;
      }

      .a4-page {
        margin: 0;
        box-shadow: none;
        break-after: avoid-page;
      }

      .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <main class="a4-page">
    <div class="form-number">แบบ ๓</div>
    <h1 class="title">ใบขออนุมัติใช้รถส่วนกลาง</h1>

    <p class="request-date">
      วันที่ <span class="date-field">${requestedOn.day}</span>
      เดือน <span class="date-field month">${requestedOn.month}</span>
      พ.ศ. <span class="date-field year">${requestedOn.year}</span>
    </p>

    <p class="recipient">เรียน&nbsp;&nbsp;${printable(selectedRecipient)}</p>

    <section class="details">
      <p class="detail-row requester-identity">
        <span class="requester-name-group">
          <span>ชื่อหน่วย / บริการส่วนงาน</span><span class="field-line requester-name-line">${requesterDepartment}</span>
        </span>
        <span class="requester-position-group">
          <span>ประเภท / จำนวน</span><span class="field-line requester-position-line">${carType} / ${passengerCount} คน</span>
        </span>
      </p>
      <p class="detail-row destination-row">
        <span>ขออนุมัติใช้รถ (ไปเรียน)</span>
        <span class="field-line destination-line">${destination}${province}</span>
      </p>
      <p class="detail-row purpose-row">
        <span>เหตุที่ต้องการรถ</span>
        <span class="field-line purpose-line">${purpose}</span>
      </p>
      <p class="detail-row travel-row">
        <span>เริ่มต้น</span>
        <span class="field-line travel-date-line">${startsAt.day}&nbsp;${startsAt.month}&nbsp;${startsAt.year}</span>
        <span>เวลา</span>
        <span class="field-line travel-time-line">${startsAt.time}</span>
        <span>น.</span>
      </p>
      <p class="detail-row travel-row">
        <span>ถึง</span>
        <span class="field-line travel-date-line">${endsAt.day}&nbsp;${endsAt.month}&nbsp;${endsAt.year}</span>
        <span>เวลา</span>
        <span class="field-line travel-time-line">${endsAt.time}</span>
        <span>น.</span>
      </p>
    </section>

    <section class="signature requester-signature">
      <p class="signature-line">(ลงชื่อ)............................................................ผู้ขออนุญาต</p>
      <p>(${requesterName})</p>
      <p>${requesterPosition}</p>
      <p>${requesterDepartment}</p>
    </section>

    <section class="vehicle">
      <p class="vehicle-row">
        <span>รถยนต์</span>
        <span class="field-line vehicle-type-line">${carType}</span>
        <span>หมายเลขทะเบียน</span>
        <span class="field-line license-plate-line">${carPlate}</span>
      </p>
      <p class="driver-row vehicle-row">
        <span>พนักงานขับรถยนต์</span>
        <span class="field-line license-plate-line">${driverName}</span>
      </p>
    </section>

    <section class="signature review-signature">
      <p class="signature-line">
        <span>ลงชื่อ</span><span class="signature-leader"></span><span>หัวหน้าฝ่ายหรือผู้แทน</span>
      </p>
      <p class="signature-date">
        <span class="signature-date-rule">
          <span class="signature-date-spacer"></span><span>/</span><span class="signature-date-spacer"></span><span>/</span>
          <span class="signature-date-spacer"></span>
        </span>
        <span class="signature-date-label">(วัน เดือน ปี)</span>
      </p>
    </section>

    <p class="approval-order">อนุญาต และพนักงานขับรถยนต์จัดทำแบบรายงานการใช้รถ (แบบ ๔) ให้เรียบร้อยด้วย</p>

    <section class="signature authority-signature">
      <p class="signature-line">
        <span>(ลงนามผู้มีอำนาจสั่งใช้รถ)</span><span class="signature-leader"></span>
      </p>
      <p class="signature-date">
        <span class="signature-date-rule">
          <span class="signature-date-spacer"></span><span>/</span><span class="signature-date-spacer"></span><span>/</span>
          <span class="signature-date-spacer"></span>
        </span>
        <span class="signature-date-label">(วัน เดือน ปี)</span>
      </p>
    </section>
  </main>
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