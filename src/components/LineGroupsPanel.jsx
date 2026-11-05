import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { Alert, Card, EmptyState, Modal, SectionTitle, Spinner } from './ui'

const GROUP_ID_PATTERN = /^[CUR][0-9a-fA-F]{32}$/

const emptyForm = {
  name: '',
  group_id: '',
  note: '',
  is_default: false,
}

function validateGroupId(value) {
  if (!value.trim()) return 'กรุณากรอก Group ID'
  if (!GROUP_ID_PATTERN.test(value.trim())) {
    return 'Group ID ต้องขึ้นต้นด้วย C (หรือ U/R) ตามด้วยตัวอักษร a-f หรือตัวเลข 32 ตัว'
  }
  return ''
}

export function LineGroupsPanel({ onError }) {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('line_groups')
      .select('*')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true })

    if (error) {
      onError?.(`โหลดรายการกลุ่ม LINE ไม่สำเร็จ: ${error.message}`)
    } else {
      setGroups(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const defaultGroup = useMemo(
    () => groups.find((group) => group.is_default) || null,
    [groups],
  )

  const openAdd = () => {
    setEditingGroup(null)
    setForm({ ...emptyForm, is_default: groups.length === 0 })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (group) => {
    setEditingGroup(group)
    setForm({
      name: group.name || '',
      group_id: group.group_id || '',
      note: group.note || '',
      is_default: Boolean(group.is_default),
    })
    setFormError('')
    setModalOpen(true)
  }

  const save = async (event) => {
    event.preventDefault()
    const groupIdError = validateGroupId(form.group_id)
    if (!form.name.trim()) {
      setFormError('กรุณากรอกชื่อกลุ่ม')
      return
    }
    if (groupIdError) {
      setFormError(groupIdError)
      return
    }

    setBusy(true)
    setFormError('')
    const payload = {
      name: form.name.trim(),
      group_id: form.group_id.trim(),
      note: form.note.trim() || null,
      is_default: Boolean(form.is_default) || groups.length === 0,
      updated_at: new Date().toISOString(),
    }

    const result = editingGroup
      ? await supabase.from('line_groups').update(payload).eq('id', editingGroup.id)
      : await supabase.from('line_groups').insert(payload)
    setBusy(false)

    if (result.error) {
      const duplicate = result.error.code === '23505'
      setFormError(
        duplicate
          ? 'Group ID นี้มีอยู่ในระบบแล้ว'
          : `บันทึกไม่สำเร็จ: ${result.error.message}`,
      )
      return
    }

    setModalOpen(false)
    setNotice(editingGroup ? 'แก้ไขข้อมูลกลุ่ม LINE แล้ว' : 'เพิ่มกลุ่ม LINE แล้ว')
    await load()
  }

  const setDefault = async (group) => {
    setBusy(true)
    setNotice('')
    const { error } = await supabase
      .from('line_groups')
      .update({ is_default: true, updated_at: new Date().toISOString() })
      .eq('id', group.id)
    setBusy(false)

    if (error) {
      onError?.(`ตั้งกลุ่มเริ่มต้นไม่สำเร็จ: ${error.message}`)
      return
    }
    setNotice(`ตั้ง "${group.name}" เป็นกลุ่มเริ่มต้นสำหรับแจ้งเตือนแล้ว`)
    await load()
  }

  const remove = async (group) => {
    const ok = window.confirm(
      `ต้องการลบกลุ่ม "${group.name}" ออกจากระบบหรือไม่?\nระบบจะไม่ส่งแจ้งเตือนเข้ากลุ่มนี้อีก`,
    )
    if (!ok) return

    setBusy(true)
    const { error } = await supabase.from('line_groups').delete().eq('id', group.id)
    setBusy(false)

    if (error) {
      onError?.(`ลบกลุ่ม LINE ไม่สำเร็จ: ${error.message}`)
      return
    }
    setNotice(
      group.is_default
        ? 'ลบกลุ่มเริ่มต้นแล้ว ระบบจะใช้ค่า LINE_GROUP_ID สำรอง (ถ้ามี)'
        : 'ลบกลุ่ม LINE แล้ว',
    )
    await load()
  }

  const copyGroupId = async (group) => {
    try {
      await navigator.clipboard.writeText(group.group_id)
      setNotice(`คัดลอก Group ID ของ "${group.name}" แล้ว`)
    } catch {
      onError?.('คัดลอกไม่สำเร็จ กรุณาคัดลอกด้วยมือ')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">จัดการกลุ่ม LINE</h3>
          <p className="text-xs text-slate-500">
            ทั้งหมด {groups.length} กลุ่ม · กลุ่มเริ่มต้น:{' '}
            <span className="font-semibold text-emerald-700">
              {defaultGroup?.name || 'ยังไม่ได้ตั้ง (ใช้ LINE_GROUP_ID สำรอง)'}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800"
        >
          ➕ เพิ่มกลุ่ม LINE
        </button>
      </div>

      {notice ? <Alert tone="success">{notice}</Alert> : null}

      <Alert tone="info">
        <p className="font-semibold">วิธีดึง Group ID</p>
        <p className="mt-1 leading-relaxed">
          เชิญ LINE OA <b>EduLP_Management</b> เข้ากลุ่ม แล้วพิมพ์ <code className="rounded bg-white px-1">/groupid</code>{' '}
          ในกลุ่ม บอทจะตอบ Group ID กลับมา (ขึ้นต้นด้วย C) จากนั้นนำมากรอกที่นี่
          หรือกดบันทึกอัตโนมัติเมื่อบอทเข้ากลุ่มก็ได้
        </p>
        <p className="mt-1 text-xs">
          ต้องเปิด <b>Allow bot to join group chats</b> ใน LINE Developers Console → Messaging API ก่อน
        </p>
      </Alert>

      <Card className="p-5">
        <SectionTitle
          title="กลุ่มที่เชื่อมต่อแล้ว"
          subtitle="กลุ่มเริ่มต้นจะได้รับข้อความแจ้งเตือนหลักจากระบบ"
        />

        {loading ? (
          <Spinner label="กำลังโหลดกลุ่ม LINE..." />
        ) : groups.length === 0 ? (
          <EmptyState
            title="ยังไม่มีกลุ่ม LINE"
            description="เพิ่มกลุ่มแรกเพื่อให้ระบบส่งแจ้งเตือนเข้ากลุ่มฝ่ายการศึกษา"
            action={
              <button
                type="button"
                onClick={openAdd}
                className="mt-3 rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800"
              >
                เพิ่มกลุ่ม LINE
              </button>
            }
          />
        ) : (
          <div className="space-y-2">
            {groups.map((group) => (
              <div
                key={group.id}
                className={`rounded-2xl border p-4 transition ${
                  group.is_default
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold text-slate-800">{group.name}</p>
                      {group.is_default ? (
                        <span className="rounded-full border border-emerald-200 bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                          กลุ่มเริ่มต้น
                        </span>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => void copyGroupId(group)}
                      title="คัดลอก Group ID"
                      className="mt-1 block max-w-full truncate rounded bg-slate-100 px-2 py-1 font-mono text-[11px] text-slate-600 hover:bg-slate-200"
                    >
                      {group.group_id} 📋
                    </button>
                    {group.note ? (
                      <p className="mt-1 text-xs text-slate-500">{group.note}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {!group.is_default ? (
                      <button
                        type="button"
                        onClick={() => void setDefault(group)}
                        disabled={busy}
                        className="rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50 disabled:opacity-60"
                      >
                        ตั้งเป็นกลุ่มเริ่มต้น
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openEdit(group)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    >
                      ✏️ แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(group)}
                      disabled={busy}
                      className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
                    >
                      🗑️ ลบ
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingGroup ? 'แก้ไขกลุ่ม LINE' : 'เพิ่มกลุ่ม LINE'}
      >
        <form onSubmit={save} className="space-y-4">
          {formError ? <Alert tone="danger">{formError}</Alert> : null}

          <label className="block space-y-1 text-xs font-medium text-slate-600">
            ชื่อกลุ่ม *
            <input
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="เช่น ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-600">
            Group ID *
            <input
              required
              value={form.group_id}
              onChange={(event) => setForm({ ...form, group_id: event.target.value })}
              placeholder="Cxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-brand-500"
            />
            <span className="block text-[11px] text-slate-400">
              ขึ้นต้นด้วย C ตามด้วยตัวอักษร a-f หรือตัวเลข 32 ตัว
            </span>
          </label>

          <label className="block space-y-1 text-xs font-medium text-slate-600">
            หมายเหตุ
            <input
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
              placeholder="เช่น กลุ่มหลักของฝ่ายการศึกษา"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
            />
          </label>

          <label className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-slate-700">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(event) => setForm({ ...form, is_default: event.target.checked })}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>
              ใช้เป็นกลุ่มเริ่มต้น
              <span className="mt-0.5 block text-[11px] text-slate-500">
                ระบบจะส่งแจ้งเตือนหลักเข้ากลุ่มนี้ (มีกลุ่มเริ่มต้นได้เพียงกลุ่มเดียว)
              </span>
            </span>
          </label>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              {busy ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
