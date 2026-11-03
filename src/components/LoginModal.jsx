import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { ROLE } from '../lib/helpers'
import { Alert, Modal } from './ui'

const ROLES = ['requester', 'admin', 'head_of_dept', 'driver']

const ROLE_DESCRIPTION = {
  requester: 'กรอกใบขอใช้รถ และติดตามสถานะคำขอของตนเอง',
  admin: 'จัดการคิว จัดสรรรถและพนักงานขับรถ อัปเดตสถานะ',
  head_of_dept: 'พิจารณาอนุมัติคำขอในเวลาราชการ (ปฏิบัติราชการแทน ผอ.เขต)',
  driver: 'ดูตารางงานที่ได้รับมอบหมายของตนเอง',
}

export function LoginModal({ open, onClose, onLoggedIn }) {
  const { login } = useAuth()
  const [role, setRole] = useState('requester')
  const [name, setName] = useState('')
  const [position, setPosition] = useState('')
  const [department, setDepartment] = useState('ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว')
  const [error, setError] = useState('')
  const [drivers, setDrivers] = useState([])
  const [loadingDrivers, setLoadingDrivers] = useState(false)

  useEffect(() => {
    if (!open || role !== 'driver' || drivers.length > 0) return
    const load = async () => {
      setLoadingDrivers(true)
      const { data } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })
      setDrivers(data || [])
      setLoadingDrivers(false)
    }
    load()
  }, [open, role, drivers.length])

  const pickDriver = (driverId) => {
    const driver = drivers.find((item) => item.id === driverId)
    if (!driver) {
      setName('')
      return
    }
    setName(driver.full_name)
    setPosition('พนักงานขับรถ')
    setDepartment(driver.dept === 'education' ? 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว' : 'พนักงานขับรถฝ่ายอื่น')
  }

  const submit = (event) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('กรุณาระบุชื่อ-สกุล')
      return
    }
    login({
      name: name.trim(),
      role,
      position: position.trim() || ROLE[role],
      department: department.trim() || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
    })
    setError('')
    setName('')
    setPosition('')
    onClose()
    if (onLoggedIn) onLoggedIn(role)
  }

  return (
    <Modal open={open} onClose={onClose} title="เข้าสู่ระบบใช้งาน">
      <form onSubmit={submit} className="space-y-4">
        <Alert tone="warning">
          <p className="font-medium">โหมดทดลองใช้งาน (Demo)</p>
          <p className="mt-1 text-xs leading-relaxed">
            ระบบนี้ยังไม่เชื่อม LINE Login จึงใช้การเลือกบทบาทและระบุชื่อเพื่อทดสอบขั้นตอนทำงาน
            ก่อนเปิดใช้งานจริงควรเปลี่ยนเป็น LINE Login หรือ Supabase Auth
          </p>
        </Alert>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-700">บทบาทผู้ใช้งาน</label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ROLES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRole(value)}
                className={`rounded-xl border p-3 text-left transition ${
                  role === value
                    ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200'
                    : 'border-slate-200 bg-white hover:border-brand-300'
                }`}
              >
                <p className="text-sm font-semibold text-slate-800">{ROLE[value]}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{ROLE_DESCRIPTION[value]}</p>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {role === 'driver' ? 'เลือกพนักงานขับรถ' : 'ชื่อ-สกุล'}{' '}
            <span className="text-rose-500">*</span>
          </label>
          {role === 'driver' ? (
            <>
              <select
                value={drivers.find((item) => item.full_name === name)?.id || ''}
                onChange={(event) => pickDriver(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="">
                  {loadingDrivers ? 'กำลังโหลดรายชื่อ...' : '-- เลือกชื่อพนักงานขับรถ --'}
                </option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.full_name}{driver.nickname ? ` (${driver.nickname})` : ''}
                  </option>
                ))}
              </select>
              {!loadingDrivers && drivers.length === 0 ? (
                <p className="mt-1 text-xs text-amber-600">
                  ยังไม่มีรายชื่อพนักงานขับรถในระบบ ให้เจ้าหน้าที่เพิ่มในเมนู “รถและคนขับ” ก่อน
                </p>
              ) : null}
            </>
          ) : (
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="เช่น นายรัชชานนท์ ประจงกิจ"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">ตำแหน่ง</label>
            <input
              value={position}
              onChange={(event) => setPosition(event.target.value)}
              placeholder="เช่น เจ้าพนักงานธุรการปฏิบัติงาน"
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">สังกัด</label>
            <input
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
        </div>

        {error ? <Alert tone="danger">{error}</Alert> : null}

        <button
          type="submit"
          className="w-full rounded-xl bg-brand-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-800"
        >
          เข้าสู่ระบบ
        </button>
      </form>
    </Modal>
  )
}
