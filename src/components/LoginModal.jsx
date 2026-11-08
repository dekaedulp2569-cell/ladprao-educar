import { useState } from 'react'
import { beginLineLogin } from '../lib/lineAuth'
import { Alert, ContactHelp, Modal } from './ui'

export function LoginModal({ open, onClose, onLoggedIn }) {
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      const approvalStatus = await beginLineLogin()
      if (approvalStatus) {
        onClose()
        onLoggedIn?.(approvalStatus)
      }
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'เข้าสู่ระบบไม่สำเร็จ')
      setLoading(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="เข้าสู่ระบบด้วย LINE">
      <div className="space-y-4">
        <p className="text-sm leading-relaxed text-slate-600">
          ใช้บัญชี LINE เพื่อยืนยันตัวตน ระบบจะตรวจสอบและแจ้งสถานะการอนุมัติบัญชีก่อนเข้าใช้งาน
        </p>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-relaxed text-slate-600">
          <b className="text-slate-800">ขั้นตอนการเข้าใช้งาน</b>
          <div className="mt-1.5 space-y-1">
            <p>1️⃣ กดปุ่มด้านล่างและยืนยันตัวตนด้วย LINE</p>
            <p>2️⃣ ระบบตรวจสิทธิ์บัญชีของคุณ</p>
            <p>3️⃣ บัญชีใหม่ต้องได้รับอนุมัติจากผู้ดูแลก่อนใช้งาน — แจ้งผลทาง LINE</p>
          </div>
        </div>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-xl bg-[#06C755] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#05b34c] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'กำลังเชื่อมต่อ LINE…' : 'เข้าสู่ระบบด้วย LINE'}
        </button>
        <ContactHelp subtitle="เข้าสู่ระบบไม่ได้หรือไม่มีสิทธิ์ใช้งาน" />
      </div>
    </Modal>
  )
}
