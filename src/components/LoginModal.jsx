import { useState } from 'react'
import { beginLineLogin } from '../lib/lineAuth'
import { Alert, Modal } from './ui'

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
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="w-full rounded-xl bg-[#06C755] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#05b34c] disabled:cursor-wait disabled:opacity-60"
        >
          {loading ? 'กำลังเชื่อมต่อ LINE…' : 'เข้าสู่ระบบด้วย LINE'}
        </button>
      </div>
    </Modal>
  )
}
