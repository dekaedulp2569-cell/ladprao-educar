import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

const ROLE_LABEL = {
  requester: 'เจ้าหน้าที่ผู้ขอใช้รถ',
  driver: 'พนักงานขับรถ',
  head_of_dept: 'หัวหน้าฝ่ายการศึกษา',
  admin: 'เจ้าหน้าที่จัดการรถ (Admin)',
}

const LINE_ID_PATTERN = /^[CUR][0-9a-f]{32}$/i

export function RelatedPeoplePicker({ value = [], onChange, disabled = false }) {
  const [contacts, setContacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [manualValue, setManualValue] = useState('')
  const [manualError, setManualError] = useState('')
  const dropdownRef = useRef(null)

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

  // ปิด Dropdown เมื่อคลิกข้างนอก
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const selected = useMemo(
    () => (Array.isArray(value) ? value.filter(Boolean) : []),
    [value],
  )

  const contactById = useMemo(
    () => new Map(contacts.map((contact) => [contact.line_user_id, contact])),
    [contacts],
  )

  // กรองรายชื่อตามคำค้นหา (ชื่อ, ตำแหน่ง, ฝ่าย)
  const filteredContacts = useMemo(() => {
    if (!searchTerm.trim()) return contacts
    const term = searchTerm.toLowerCase().trim()
    return contacts.filter((c) => {
      const name = (c.full_name || '').toLowerCase()
      const roleText = (ROLE_LABEL[c.role] || c.role || '').toLowerCase()
      const dept = (c.department || '').toLowerCase()
      const lineId = (c.line_user_id || '').toLowerCase()
      return (
        name.includes(term) ||
        roleText.includes(term) ||
        dept.includes(term) ||
        lineId.includes(term)
      )
    })
  }, [contacts, searchTerm])

  const toggle = (lineUserId) => {
    if (disabled) return
    const next = selected.includes(lineUserId)
      ? selected.filter((id) => id !== lineUserId)
      : [...selected, lineUserId]
    onChange?.(next)
  }

  const selectAllFiltered = () => {
    if (disabled) return
    const idsToAdd = filteredContacts
      .map((c) => c.line_user_id)
      .filter((id) => !selected.includes(id))
    onChange?.([...selected, ...idsToAdd])
  }

  const clearSelection = () => {
    if (disabled) return
    onChange?.([])
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
        เลือกผู้ที่ต้องได้รับข้อความแจ้งเตือนผ่าน LINE เมื่อคำขอนี้ถูกสร้าง อัปเดตสถานะ หรือแจ้งเตือนคิว
      </p>

      {/* กล่อง Dropdown แบบเลือกพร้อมค้นหา */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => !disabled && setIsOpen((prev) => !prev)}
          disabled={disabled || loading}
          className={`flex w-full items-center justify-between gap-2 rounded-xl border bg-white px-4 py-2.5 text-left text-sm font-medium transition shadow-sm ${
            isOpen
              ? 'border-emerald-600 ring-2 ring-emerald-500/20'
              : 'border-slate-300 hover:border-slate-400'
          } ${disabled ? 'cursor-not-allowed bg-slate-100 opacity-60' : ''}`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-emerald-700">👥</span>
            <span className="truncate text-slate-800">
              {loading
                ? 'กำลังโหลดรายชื่อ...'
                : selected.length > 0
                  ? `เลือกผู้ที่เกี่ยวข้องแล้ว (${selected.length} คน)`
                  : 'คลิกเพื่อเลือกผู้ที่เกี่ยวข้อง (Dropdown)'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {selected.length > 0 && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                {selected.length}
              </span>
            )}
            <span className={`text-xs text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
              ▼
            </span>
          </div>
        </button>

        {/* เมนู Dropdown Popover */}
        {isOpen && (
          <div className="absolute left-0 right-0 top-full z-40 mt-1.5 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
            {/* ช่องค้นหา */}
            <div className="relative mb-2">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 text-sm">
                🔍
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="ค้นหาชื่อ, ตำแหน่ง, ฝ่าย/สังกัด..."
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-9 pr-8 text-xs text-slate-800 placeholder-slate-400 focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                autoFocus
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>

            {/* แถบการจัดการเร็ว */}
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500 px-1">
              <span>พบ {filteredContacts.length} รายชื่อ</span>
              <div className="flex items-center gap-2">
                {filteredContacts.length > 0 && (
                  <button
                    type="button"
                    onClick={selectAllFiltered}
                    className="text-emerald-700 hover:underline font-medium"
                  >
                    เลือกทั้งหมด
                  </button>
                )}
                {selected.length > 0 && (
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="text-rose-600 hover:underline font-medium"
                  >
                    ล้างการเลือก
                  </button>
                )}
              </div>
            </div>

            {/* Check List รายชื่อ */}
            {filteredContacts.length > 0 ? (
              <div className="max-h-60 space-y-1 overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-1.5">
                {filteredContacts.map((contact) => {
                  const isChecked = selected.includes(contact.line_user_id)
                  const roleName = ROLE_LABEL[contact.role] || contact.role || 'เจ้าหน้าที่'
                  return (
                    <label
                      key={contact.line_user_id}
                      className={`flex cursor-pointer items-start gap-2.5 rounded-lg p-2 text-xs transition ${
                        isChecked
                          ? 'bg-emerald-50 text-emerald-950 font-medium'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggle(contact.line_user_id)}
                        disabled={disabled}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-semibold text-slate-900">{contact.full_name}</span>
                          <span className="rounded bg-slate-200/80 px-1.5 py-0.5 text-[10px] text-slate-700">
                            {roleName}
                          </span>
                        </div>
                        {contact.department && (
                          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                            {contact.department}
                          </div>
                        )}
                      </div>
                    </label>
                  )
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                ไม่พบรายชื่อที่ตรงกับ &ldquo;{searchTerm}&rdquo;
              </div>
            )}

            {/* ส่วนเพิ่ม LINE User ID ด้วยตนเอง */}
            <div className="mt-2.5 border-t border-slate-200 pt-2.5">
              <div className="text-[11px] font-semibold text-slate-600 mb-1.5">
                หรือระบุ LINE User ID เพิ่มเติม (ถ้ามี):
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addManual()
                    }
                  }}
                  placeholder="เช่น U1a2b3c4d... (กด Enter เพื่อเพิ่ม)"
                  className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={addManual}
                  className="rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  เพิ่ม
                </button>
              </div>
              {manualError && <p className="mt-1 text-[11px] text-rose-600">{manualError}</p>}
            </div>

            {/* ปุ่มปิด Dropdown */}
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg bg-emerald-700 px-3.5 py-1 text-xs font-semibold text-white hover:bg-emerald-800"
              >
                เรียบร้อย
              </button>
            </div>
          </div>
        )}
      </div>

      {loadError && <p className="text-xs text-amber-700">{loadError}</p>}

      {/* ส่วนแสดงรายชื่อ + ตำแหน่ง ที่เลือกแล้ว */}
      {selected.length > 0 && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
          <div className="mb-2 flex items-center justify-between text-xs font-semibold text-emerald-900">
            <span>รายชื่อผู้ที่เกี่ยวข้องที่เลือกแล้ว ({selected.length} คน):</span>
            {!disabled && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-[11px] text-rose-600 hover:underline"
              >
                ล้างทั้งหมด
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {selected.map((lineUserId) => {
              const contact = contactById.get(lineUserId)
              const roleName = contact ? ROLE_LABEL[contact.role] || contact.role : 'LINE ID กำหนดเอง'
              return (
                <div
                  key={lineUserId}
                  className="flex items-start justify-between gap-2 rounded-lg border border-emerald-200/80 bg-white p-2.5 shadow-sm text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-800 truncate">
                      {contact?.full_name || `LINE ${lineUserId.slice(0, 8)}…`}
                    </div>
                    <div className="text-[11px] text-emerald-700 font-medium">
                      ตำแหน่ง: {roleName}
                    </div>
                    {contact?.department && (
                      <div className="text-[10px] text-slate-500 truncate">
                        สังกัด: {contact.department}
                      </div>
                    )}
                  </div>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => toggle(lineUserId)}
                      className="text-slate-400 hover:text-rose-600 text-sm p-0.5"
                      title="ลบออก"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
