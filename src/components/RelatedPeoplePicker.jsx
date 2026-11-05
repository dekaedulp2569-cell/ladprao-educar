import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLE_LABEL = {
  requester: 'ผู้ขอใช้รถ',
  driver: 'พนักงานขับรถ',
  head_of_dept: 'หัวหน้าฝ่ายการศึกษา',
  admin: 'ผู้ดูแลระบบ',
}

const LINE_ID_PATTERN = /^[CUR][0-9a-f]{32}$/i

export function RelatedPeoplePicker({ value = [], onChange, disabled = false }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [manualValue, setManualValue] = useState('')
  const [manualError, setManualError] = useState('')

  useEffect(() => {
    let active = true
    const load = async () => {
      const { data, error } = await supabase.rpc('list_line_contacts')
      if (!active) return
      if (error) {
        setLoadError('โหลดรายชื่อผู้ใช้งานไม่สำเร็จ กรุณากรอก LINE User ID ด้วยตนเอง')
        setContacts([])
      } else {
        setContacts(data || [])
      }
      setLoading(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [])

  const selected = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : []),
    [value],
  )
  const contactById = useMemo(
    () => new Map(contacts.map((contact) => [contact.line_user_id, contact])),
    [contacts],
  )

  const toggle = (lineUserId) => {
    if (disabled) return
    const next = selected.includes(lineUserId)
      ? selected.filter((id) => id !== lineUserId)
      : [...selected, lineUserId]
    onChange?.(next)
  }

  const addManual = () => {
    if (disabled) return
    setManualError('')
    const candidates = manualValue
      .split(/[\s,;]+/)
      .map((id) => id.trim())
      .filter(Boolean)
    if (candidates.length === 0) return

    const invalid = candidates.filter((id) => !LINE_ID_PATTERN.test(id))
    if (invalid.length > 0) {
      setManualError(`LINE User ID ไม่ถูกต้อง: ${invalid.join(', ')}`)
      return
    }

    const next = [...selected]
    for (const id of candidates) {
      if (!next.includes(id)) next.push(id)
    }
    onChange?.(next)
    setManualValue('')
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        เลือกผู้ที่ต้องได้รับข้อความ LINE เมื่อคำขอนี้ถูกบันทึก อัปเดตสถานะ หรือแจ้งเตือนซ้ำ
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">กำลังโหลดรายชื่อ...</p>
      ) : contacts.length > 0 ? (
        <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {contacts.map((contact) => (
            <label
              key={contact.line_user_id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50"
            >
              <input
                type="checkbox"
                checked={selected.includes(contact.line_user_id)}
                onChange={() => toggle(contact.line_user_id)}
                disabled={disabled}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-500"
              />
              <span className="min-w-0">
                <span className="block font-medium text-slate-800">{contact.full_name}</span>
                <span className="block text-xs text-slate-500">
                  {[ROLE_LABEL[contact.role] || contact.role, contact.department]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </label>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-500">ยังไม่มีผู้ใช้งานที่เชื่อม LINE และได้รับอนุมัติ</p>
      )}

      {loadError ? <p className="text-xs text-amber-700">{loadError}</p> : null}

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((lineUserId) => {
            const contact = contactById.get(lineUserId)
            return (
              <span
                key={lineUserId}
                className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-800"
              >
                {contact?.full_name || `LINE ${lineUserId.slice(0, 8)}…`}
                {!disabled ? (
                  <button
                    type="button"
                    onClick={() => toggle(lineUserId)}
                    className="text-brand-600 hover:text-brand-900"
                    aria-label={`ลบ ${contact?.full_name || lineUserId}`}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            )
          })}
        </div>
      ) : null}

      {!disabled ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={manualValue}
            onChange={(event) => setManualValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addManual()
              }
            }}
            placeholder="หรือกรอก LINE User ID (U...) คั่นด้วยเครื่องหมายจุลภาค"
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="button"
            onClick={addManual}
            className="shrink-0 rounded-xl border border-brand-300 bg-white px-4 py-2 text-sm font-semibold text-brand-800 hover:bg-brand-50"
          >
            เพิ่ม
          </button>
        </div>
      ) : null}
      {manualError ? <p className="text-xs text-rose-600">{manualError}</p> : null}
    </div>
  )
}
