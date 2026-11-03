import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE } from '../lib/helpers'
import { Card, EmptyState, Modal, Spinner } from './ui'

const ROLE_BADGES = {
  admin: { label: 'ผู้ดูแลระบบ (Admin)', className: 'bg-purple-50 text-purple-700 border-purple-200' },
  head_of_dept: { label: 'หัวหน้าฝ่ายการศึกษา', className: 'bg-brand-50 text-brand-800 border-brand-200' },
  driver: { label: 'พนักงานขับรถ', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  requester: { label: 'ผู้ขอใช้รถ', className: 'bg-slate-100 text-slate-700 border-slate-200' },
}

const emptyMemberForm = {
  full_name: '',
  position: '',
  department: 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
  role: 'requester',
  phone: '',
  email: '',
  line_user_id: '',
  approval_status: 'pending',
}

export function MembersPanel({ onError }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')

  const [addModalOpen, setAddModalOpen] = useState(false)
  const [addForm, setAddForm] = useState(emptyMemberForm)

  const [editingMember, setEditingMember] = useState(null)
  const [editForm, setEditForm] = useState(emptyMemberForm)

  const loadMembers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      if (onError) onError(`โหลดข้อมูลสมาชิกไม่สำเร็จ: ${error.message}`)
    } else {
      setMembers(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMembers()
  }, [])

  // บันทึกสมาชิกใหม่
  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!addForm.full_name.trim()) return
    setBusy(true)

    const payload = {
      full_name: addForm.full_name.trim(),
      position: addForm.position.trim() || ROLE[addForm.role],
      department: addForm.department.trim() || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
      role: addForm.role,
      approval_status: 'approved',
      phone: addForm.phone.trim() || null,
      email: addForm.email.trim() || null,
      line_user_id: addForm.line_user_id.trim() || null,
    }

    const { error } = await supabase.from('user_profiles').insert(payload)
    setBusy(false)

    if (error) {
      if (onError) onError(`เพิ่มสมาชิกไม่สำเร็จ: ${error.message}`)
      return
    }

    setAddForm(emptyMemberForm)
    setAddModalOpen(false)
    loadMembers()
  }

  // แก้ไขสมาชิก
  const handleEditClick = (member) => {
    setEditingMember(member)
    setEditForm({
      full_name: member.full_name || '',
      position: member.position || '',
      department: member.department || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
      role: member.role || 'requester',
      phone: member.phone || '',
      email: member.email || '',
      line_user_id: member.line_user_id || '',
      approval_status: member.approval_status || 'approved',
    })
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editingMember || !editForm.full_name.trim()) return
    setBusy(true)

    const payload = {
      full_name: editForm.full_name.trim(),
      position: editForm.position.trim() || ROLE[editForm.role],
      department: editForm.department.trim() || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
      role: editForm.role,
      approval_status: editForm.approval_status,
      phone: editForm.phone.trim() || null,
      email: editForm.email.trim() || null,
      line_user_id: editForm.line_user_id.trim() || null,
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('id', editingMember.id)
    setBusy(false)

    if (error) {
      if (onError) onError(`แก้ไขสมาชิกไม่สำเร็จ: ${error.message}`)
      return
    }

    setEditingMember(null)
    loadMembers()
  }

  // ลบสมาชิก
  const handleDelete = async (member) => {
    const ok = window.confirm(`คุณแน่ใจหรือไม่ว่าต้องการลบสมาชิก "${member.full_name}" ออกจากระบบ?`)
    if (!ok) return

    setBusy(true)
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('id', member.id)
    setBusy(false)

    if (error) {
      if (onError) onError(`ลบสมาชิกไม่สำเร็จ: ${error.message}`)
      return
    }

    loadMembers()
  }

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (
        m.full_name?.toLowerCase().includes(q) ||
        m.position?.toLowerCase().includes(q) ||
        m.department?.toLowerCase().includes(q) ||
        m.phone?.includes(q)
      )
    })
  }, [members, roleFilter, search])

  const counts = useMemo(() => {
    return members.reduce(
      (acc, m) => {
        acc[m.role] = (acc[m.role] || 0) + 1
        return acc
      },
      { admin: 0, head_of_dept: 0, driver: 0, requester: 0 },
    )
  }, [members])

  return (
    <div className="space-y-5">
      {/* ส่วนควบคุมและสถิติ */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">จัดการสมาชิกและผู้ใช้งานระบบ</h3>
          <p className="text-xs text-slate-500">
            ทั้งหมด {members.length} คน (Admin: {counts.admin}, หัวหน้าฝ่าย: {counts.head_of_dept}, พขร.: {counts.driver}, ผู้ขอใช้: {counts.requester})
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-800"
          >
            ➕ เพิ่มสมาชิกใหม่
          </button>
        </div>
      </div>

      {/* ค้นหาและตัวกรอง */}
      <Card className="p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {[
              { value: 'all', label: `ทั้งหมด (${members.length})` },
              { value: 'admin', label: `Admin (${counts.admin})` },
              { value: 'head_of_dept', label: `หัวหน้าฝ่าย (${counts.head_of_dept})` },
              { value: 'driver', label: `คนขับ (${counts.driver})` },
              { value: 'requester', label: `ผู้ขอ (${counts.requester})` },
            ].map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setRoleFilter(tab.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  roleFilter === tab.value
                    ? 'bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาชื่อ ตำแหน่ง สังกัด หรือเบอร์โทร"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:max-w-xs"
          />
        </div>
      </Card>

      {/* รายการสมาชิก */}
      {loading ? (
        <Spinner />
      ) : filteredMembers.length === 0 ? (
        <EmptyState title="ไม่พบรายชื่อสมาชิก" description="ลองเปลี่ยนเงื่อนไขค้นหา หรือกดปุ่มเพิ่มสมาชิกใหม่" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => {
            const badge = ROLE_BADGES[member.role] || ROLE_BADGES.requester
            return (
              <div
                key={member.id}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{member.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">{member.position || '-'}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>

                  <div className="space-y-1 text-xs text-slate-600">
                    <p className={member.approval_status === 'approved' ? 'text-emerald-700' : 'font-semibold text-amber-700'}>
                      {member.approval_status === 'approved'
                        ? '✓ อนุมัติแล้ว'
                        : member.approval_status === 'rejected'
                          ? 'บัญชีถูกปฏิเสธ'
                          : '⏳ รออนุมัติ'}
                    </p>
                    <p className="truncate">🏢 {member.department}</p>
                    {member.phone ? <p>📞 {member.phone}</p> : null}
                    {member.email ? <p className="truncate">✉️ {member.email}</p> : null}
                    {member.line_user_id ? <p className="truncate text-emerald-700">💬 ผูก LINE แล้ว</p> : null}
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={() => handleEditClick(member)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    ✏️ แก้ไข
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(member)}
                    className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"
                  >
                    🗑️ ลบ
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal เพิ่มสมาชิกใหม่ */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="เพิ่มสมาชิกใหม่">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อ-สกุล *</label>
            <input
              required
              value={addForm.full_name}
              onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })}
              placeholder="เช่น นายสมชาย ใจดี"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ตำแหน่ง *</label>
              <input
                required
                value={addForm.position}
                onChange={(e) => setAddForm({ ...addForm, position: e.target.value })}
                placeholder="เช่น เจ้าพนักงานธุรการปฏิบัติงาน"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">บทบาทสิทธิ์ *</label>
              <select
                value={addForm.role}
                onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="requester">ผู้ขอใช้รถ (Requester)</option>
                <option value="admin">เจ้าหน้าที่จัดการรถ (Admin)</option>
                <option value="head_of_dept">หัวหน้าฝ่ายการศึกษา</option>
                <option value="driver">พนักงานขับรถ (Driver)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">สังกัด</label>
            <input
              value={addForm.department}
              onChange={(e) => setAddForm({ ...addForm, department: e.target.value })}
              placeholder="ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">เบอร์โทรศัพท์</label>
              <input
                value={addForm.phone}
                onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                placeholder="เช่น 081-234-5678"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">อีเมล</label>
              <input
                type="email"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
                placeholder="เช่น user@bangkok.go.th"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">LINE User ID (ถ้ามี)</label>
            <input
              value={addForm.line_user_id}
              onChange={(e) => setAddForm({ ...addForm, line_user_id: e.target.value })}
              placeholder="เช่น U1234567890abcdef"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              บันทึกสมาชิกใหม่
            </button>
          </div>
        </form>
      </Modal>

      {/* Modal แก้ไขสมาชิก */}
      <Modal open={Boolean(editingMember)} onClose={() => setEditingMember(null)} title="แก้ไขข้อมูลสมาชิก">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อ-สกุล *</label>
            <input
              required
              value={editForm.full_name}
              onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">ตำแหน่ง *</label>
              <input
                required
                value={editForm.position}
                onChange={(e) => setEditForm({ ...editForm, position: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">บทบาทสิทธิ์ *</label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              >
                <option value="requester">ผู้ขอใช้รถ (Requester)</option>
                <option value="admin">เจ้าหน้าที่จัดการรถ (Admin)</option>
                <option value="head_of_dept">หัวหน้าฝ่ายการศึกษา</option>
                <option value="driver">พนักงานขับรถ (Driver)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">สถานะบัญชี LINE</label>
            <select
              value={editForm.approval_status}
              onChange={(e) => setEditForm({ ...editForm, approval_status: e.target.value })}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            >
              <option value="pending">รออนุมัติ</option>
              <option value="approved">อนุมัติให้เข้าใช้</option>
              <option value="rejected">ปฏิเสธ</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">สังกัด</label>
            <input
              value={editForm.department}
              onChange={(e) => setEditForm({ ...editForm, department: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">เบอร์โทรศัพท์</label>
              <input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-700">อีเมล</label>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-700">LINE User ID</label>
            <input
              value={editForm.line_user_id}
              onChange={(e) => setEditForm({ ...editForm, line_user_id: e.target.value })}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button
              type="button"
              onClick={() => setEditingMember(null)}
              className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-brand-800 disabled:opacity-60"
            >
              บันทึกการแก้ไข
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
