import { bangkokParts, CAR_TYPE, THAI_MONTHS_LONG, toThaiDigits } from './helpers.js'

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

  const requestedOn = dateValue(bangkokParts(request.created_at || new Date()))
  const startsAt = dateValue(bangkokParts(request.start_datetime))
  const endsAt = dateValue(bangkokParts(request.end_datetime))
  const isSpecialApproval =
    request.approval_type === 'district_director' || request.is_out_of_bkk || request.is_out_of_hours
  const selectedRecipient =
    recipient || (isSpecialApproval ? OUT_OF_HOURS_RECIPIENT : BUSINESS_HOURS_RECIPIENT)
  const requesterName = printable(request.requester_name || '............................................................')
  const requesterPosition = printable(request.requester_position || '............................................................')
  const requesterDepartment = printable(
    request.requester_department || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
  )
  const destination = printable(request.destination || '')
  const province = request.destination_province ? ` (${printable(request.destination_province)})` : ''
  const purpose = printable(request.purpose || '....................................................................................................')
  const passengerCount = printable(request.passenger_count || 1)
  const carType = printable(car ? (CAR_TYPE[car.car_type] || 'รถตู้') : 'รถตู้')
  const carPlate = printable(car?.license_plate || request.external_car_info || '................................................')
  const driverName = printable(driver?.full_name || request.external_driver_name || '............................................................')

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
      padding: 9mm 20mm 10mm 30mm;
      font-size: 16pt;
      font-weight: 400;
      line-height: 1.16;
    }

    .form-number {
      text-align: right;
      font-weight: 700;
      line-height: 1;
    }

    .title {
      margin: 2mm 0 2mm;
      text-align: center;
      font-size: 20pt;
      font-weight: 700;
      line-height: 1.2;
    }

    .request-date {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 1.5mm;
      margin: 0 0 4mm;
      text-align: right;
      white-space: nowrap;
    }

    .date-field {
      display: inline-block;
      min-width: 13mm;
      padding: 0 1mm 0.5mm;
      border-bottom: 1px dotted #000;
      text-align: center;
    }

    .date-field.month {
      min-width: 27mm;
    }

    .date-field.year {
      min-width: 22mm;
    }

    .recipient {
      margin: 3mm 0;
    }

    .details {
      margin-top: 5mm;
    }

    .detail-row {
      min-height: 7.4mm;
      margin: 0;
      line-height: 1.3;
    }

    .field-line {
      display: inline-block;
      min-width: 0;
      padding: 0 1mm 0.5mm;
      border-bottom: 1px dotted #000;
      text-align: center;
      white-space: nowrap;
    }

    .destination-row,
    .purpose-row,
    .travel-row,
    .vehicle-row {
      display: flex;
      align-items: baseline;
      gap: 1mm;
      white-space: nowrap;
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
      white-space: nowrap;
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
      white-space: nowrap;
    }

    .requester-signature {
      margin-top: 10mm;
      margin-bottom: 0;
    }

    .review-signature {
      margin-top: 8mm;
      margin-bottom: 0;
    }

    .authority-signature {
      margin-top: 8mm;
      margin-bottom: 21mm;
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

    .vehicle .driver-row {
      margin-top: 1mm;
    }

    .signature-date {
      margin-top: 1mm !important;
      letter-spacing: 1mm;
    }

    .signature-date span {
      letter-spacing: 0;
      font-size: 14pt;
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
    }
  </style>
</head>
<body>
  <main class="a4-page">
    <div class="form-number">แบบ ๓</div>
    <h1 class="title">ใบขออนุญาตใช้รถส่วนกลาง</h1>

    <p class="request-date">
      วันที่ <span class="date-field">${requestedOn.day}</span>
      เดือน <span class="date-field month">${requestedOn.month}</span>
      พ.ศ. <span class="date-field year">${requestedOn.year}</span>
    </p>

    <p class="recipient">เรียน&nbsp;&nbsp;${printable(selectedRecipient)}</p>

    <section class="details">
      <p class="detail-row requester-identity">
        <span class="requester-name-group">
          <span>ข้าพเจ้า</span><span class="field-line requester-name-line">${requesterName}</span>
        </span>
        <span class="requester-position-group">
          <span>ตำแหน่ง</span><span class="field-line requester-position-line">${requesterPosition}</span>
        </span>
      </p>
      <p class="detail-row destination-row">
        <span>ขออนุญาตใช้รถ (ไปที่ไหน)</span>
        <span class="field-line destination-line">${destination}${province}</span>
      </p>
      <p class="detail-row purpose-row">
        <span>เพื่อ</span>
        <span class="field-line purpose-line">${purpose}</span>
        <span>มีคนนั่ง</span>
        <span class="field-line passenger-line">${passengerCount}</span>
        <span>คน</span>
      </p>
      <p class="detail-row travel-row">
        <span>ในวัน</span>
        <span class="field-line travel-date-line">${startsAt.day}&nbsp;${startsAt.month}&nbsp;${startsAt.year}</span>
        <span>เวลา</span>
        <span class="field-line travel-time-line">${startsAt.time}</span>
        <span>น.</span>
      </p>
      <p class="detail-row travel-row">
        <span>ถึงวัน</span>
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
      <p class="signature-line">(ลงชื่อ)............................................................หัวหน้าฝ่ายหรือผู้แทน</p>
      <p>(............................................................)</p>
      <p class="signature-date">/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;<span>(วัน เดือน ปี)</span></p>
    </section>

    <p class="approval-order">อนุญาต และพนักงานขับรถยนต์จัดทำแบบรายงานการใช้รถ (แบบ ๔) ให้เรียบร้อยด้วย</p>

    <section class="signature authority-signature">
      <p class="signature-line">(ลงนามผู้มีอำนาจสั่งใช้รถ)............................................................</p>
      <p>(............................................................)</p>
      <p class="signature-date">/&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/&nbsp;<span>(วัน เดือน ปี)</span></p>
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
