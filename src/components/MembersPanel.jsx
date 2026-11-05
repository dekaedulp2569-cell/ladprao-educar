import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { ROLE, classNames } from '../lib/helpers'
import { Card, EmptyState, Modal, Spinner } from './ui'

const ROLE_LABELS = {
  admin: 'ผู้ดูแลระบบ (Admin)',
  head_of_dept: 'หัวหน้าฝ่ายการศึกษา',
  driver: 'พนักงานขับรถ',
  requester: 'ผู้ขอใช้รถ',
}

const DEPT_LABELS = {
  education: 'ฝ่ายการศึกษา',
  other: 'ฝ่ายอื่น / สำนักงานเขต',
}

const emptyMemberForm = {
  full_name: '',
  nickname: '',
  position: '',
  department: 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
  phone: '',
  line_user_id: '',
  role: 'requester',
  driver_dept_type: 'education',
  status: 'active',
}

export function MembersPanel({ onError }) {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

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
      onError?.(`โหลดข้อมูลสมาชิกไม่สำเร็จ: ${error.message}`)
    } else {
      setMembers(data || [])
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMembers()
  }, [])

  const handleAddSubmit = async (e) => {
    e.preventDefault()
    if (!addForm.full_name.trim()) return
    setBusy(true)

    const payload = {
      full_name: addForm.full_name.trim(),
      nickname: addForm.nickname.trim() || null,
      position: addForm.position.trim() || ROLE[addForm.role] || '',
      department: addForm.department.trim() || 'ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว',
      phone: addForm.phone.trim() || null,
      line_user_id: addForm.line_user_id.trim() || null,
      role: addForm.role,
      driver_dept_type: addForm.role === 'driver' ? addForm.driver_dept_type : null,
      status: addForm.status,
    }

    const { error } = await supabase.from('user_profiles').insert(payload)
    setBusy(false)

    if (error) {
      onError?.(`เพิ่มสมาชิกไม่สำเร็จ: ${error.message}`)
      return
    }

    setAddForm(emptyMemberForm)
    setAddModalOpen(false)
    loadMembers()
  }

  const handleEditClick = (member) => {
    setEditingMember(member)
    setEditForm({
      full_name: member.full_name || '',
      nickname: member.nickname || '',
      position: member.position || '',
      department: member.department || '',
      phone: member.phone || '',
      line_user_id: member.line_user_id || '',
      role: member.role || 'requester',
      driver_dept_type: member.driver_dept_type || 'education',
      status: member.status || 'active',
    })
  }

  const handleEditSubmit = async (e) => {
    e.preventDefault()
    if (!editingMember || !editForm.full_name.trim()) return
    setBusy(true)

    const payload = {
      full_name: editForm.full_name.trim(),
      nickname: editForm.nickname.trim() || null,
      position: editForm.position.trim() || '',
      department: editForm.department.trim() || '',
      phone: editForm.phone.trim() || null,
      line_user_id: editForm.line_user_id.trim() || null,
      role: editForm.role,
      driver_dept_type: editForm.role === 'driver' ? editForm.driver_dept_type : null,
      status: editForm.status,
    }

    const { error } = await supabase
      .from('user_profiles')
      .update(payload)
      .eq('id', editingMember.id)
    setBusy(false)

    if (error) {
      onError?.(`แก้ไขสมาชิกไม่สำเร็จ: ${error.message}`)
      return
    }

    setEditingMember(null)
    loadMembers()
  }

  const handleDelete = async (member) => {
    if (!window.confirm(`ลบ "${member.full_name}" ออกจากระบบหรือไม่?`)) return
    setBusy(true)
    const { error } = await supabase.from('user_profiles').delete().eq('id', member.id)
    setBusy(false)
    if (error) { onError?.(`ลบสมาชิกไม่สำเร็จ: ${error.message}`); return }
    loadMembers()
  }

  const toggleStatus = async (member) => {
    const newStatus = member.status === 'active' ? 'inactive' : 'active'
    setBusy(true)
    const { error } = await supabase.from('user_profiles').update({ status: newStatus }).eq('id', member.id)
    setBusy(false)
    if (error) { onError?.(`อัปเดตสถานะไม่สำเร็จ: ${error.message}`); return }
    loadMembers()
  }

  const filteredMembers = useMemo(() => {
    return members.filter((m) => {
      if (roleFilter !== 'all' && m.role !== roleFilter) return false
      if (statusFilter !== 'all' && m.status !== statusFilter) return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return (m.full_name?.toLowerCase().includes(q) || m.nickname?.toLowerCase().includes(q) || m.phone?.includes(q))
    })
  }, [members, roleFilter, statusFilter, search])

  const counts = useMemo(() => {
    return members.reduce((acc, m) => { acc[m.role] = (acc[m.role] || 0) + 1; return acc }, { admin: 0, head_of_dept: 0, driver: 0, requester: 0 })
  }, [members])

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-800">จัดการสมาชิกและสิทธิ์การใช้งาน</h3>
          <p className="text-xs text-slate-500">ทั้งหมด {members.length} คน (Admin: {counts.admin}, หัวหน้าฝ่าย: {counts.head_of_dept}, พขร.: {counts.driver}, ผู้ขอ: {counts.requester})</p>
        </div>
        <button type="button" onClick={() => setAddModalOpen(true)} className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-800">➕ เพิ่มสมาชิกใหม่</button>
      </div>

      <Card className="p-4">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="flex flex-wrap gap-1.5">
            {[ 'all', 'admin', 'head_of_dept', 'driver', 'requester' ].map((tab) => (
              <button key={tab} type="button" onClick={() => setRoleFilter(tab)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${roleFilter === tab ? 'bg-brand-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {tab === 'all' ? `ทั้งหมด (${members.length})` : tab === 'admin' ? `Admin (${counts.admin})` : tab === 'head_of_dept' ? `หัวหน้าฝ่าย (${counts.head_of_dept})` : tab === 'driver' ? `คนขับ (${counts.driver})` : `ผู้ขอ (${counts.requester})`}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {[ 'all', 'active', 'inactive' ].map((tab) => (
              <button key={tab} type="button" onClick={() => setStatusFilter(tab)} className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${statusFilter === tab ? tab === 'active' ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                {tab === 'all' ? 'ทั้งหมด' : tab === 'active' ? 'ใช้งาน' : 'ระงับ'}
              </button>
            ))}
          </div>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นหาชื่อ ชื่อเล่น หรือเบอร์โทร" className="w-full rounded-xl border border-slate-300 px-3 py-2 text-xs outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 sm:max-w-xs" />
        </div>
      </Card>

      {loading ? (
        <Spinner />
      ) : filteredMembers.length === 0 ? (
        <EmptyState title="ไม่พบรายชื่อสมาชิก" description="ลองเปลี่ยนเงื่อนไขค้นหา หรือกดปุ่มเพิ่มสมาชิกใหม่" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredMembers.map((member) => {
            const roleColor = { admin: 'bg-purple-50 text-purple-700 border-purple-200', head_of_dept: 'bg-brand-50 text-brand-800 border-brand-200', driver: 'bg-blue-50 text-blue-700 border-blue-200', requester: 'bg-slate-100 text-slate-700 border-slate-200' }[member.role]
            return (
              <div key={member.id} className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-brand-300 hover:shadow-md">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="font-bold text-slate-900 truncate">{member.full_name}</p>
                        {member.nickname && <span className="text-xs font-medium text-brand-700 bg-brand-100 px-2 py-0.5 rounded">"{member.nickname}"</span>}
                      </div>
                      <p className="text-xs text-slate-500 truncate">{member.position || '-'}</p>
                    </div>
                    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${roleColor}`}>{ROLE_LABELS[member.role]}</span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p className="truncate">🏢 {member.department}</p>
                    {member.driver_dept_type && <p className="truncate">🚙 {DEPT_LABELS[member.driver_dept_type]}</p>}
                    {member.phone && <p className="truncate">📞 {member.phone}</p>}
                    {member.line_user_id ? <p className="truncate text-emerald-700">💬 ผูก LINE แล้ว</p> : <p className="truncate text-rose-600">💬 ยังไม่ผูก LINE</p>}
                  </div>
                  <p className={member.status === 'active' ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>{member.status === 'active' ? '✓ ใช้งาน' : '⚫ ระงับการใช้งาน'}</p>
                </div>
                <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  {member.status === 'active' ? (
                    <button type="button" onClick={() => toggleStatus(member)} disabled={busy} className="rounded-lg px-2.5 py-1 text-xs font-medium bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100 disabled:opacity-60">🔇 ระงับ</button>
                  ) : (
                    <button type="button" onClick={() => toggleStatus(member)} disabled={busy} className="rounded-lg px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-600 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-60">🔊 เปิดใช้งาน</button>
                  )}
                  <button type="button" onClick={() => handleEditClick(member)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50">✏️ แก้ไข</button>
                  <button type="button" onClick={() => handleDelete(member)} disabled={busy} className="rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-60">🗑️ ลบ</button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="เพิ่มสมาชิกใหม่">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อ-สกุล *</label><input required value={addForm.full_name} onChange={(e) => setAddForm({ ...addForm, full_name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อเล่น</label><input value={addForm.nickname} onChange={(e) => setAddForm({ ...addForm, nickname: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">ตำแหน่ง *</label><input required value={addForm.position} onChange={(e) => setAddForm({ ...addForm, position: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div sm:col-span="2"><label className="mb-1 block text-xs font-semibold text-slate-700">สังกัด</label><input value={addForm.department} onChange={(e) => setAddForm({ ...addForm, department: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">บทบาทสิทธิ์ *</label><select value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"><option value="requester">ผู้ขอใช้รถ</option><option value="admin">เจ้าหน้าที่จัดการรถ (Admin)</option><option value="head_of_dept">หัวหน้าฝ่ายการศึกษา</option><option value="driver">พนักงานขับรถ</option></select></div>
            {addForm.role === 'driver' ? (<div><label className="mb-1 block text-xs font-semibold text-slate-700">สังกัดคนขับ *</label><select value={addForm.driver_dept_type} onChange={(e) => setAddForm({ ...addForm, driver_dept_type: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"><option value="education">ฝ่ายการศึกษา</option><option value="other">ฝ่ายอื่น / สำนักงานเขต</option></select></div>) : null}
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">เบอร์โทรศัพท์</label><input value={addForm.phone} onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">LINE User ID</label><input value={addForm.line_user_id} onChange={(e) => setAddForm({ ...addForm, line_user_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setAddModalOpen(false)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="submit" disabled={busy} className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60">บันทึกสมาชิกใหม่</button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(editingMember)} onClose={() => setEditingMember(null)} title="แก้ไขข้อมูลสมาชิก">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อ-สกุล *</label><input required value={editForm.full_name} onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">ชื่อเล่น</label><input value={editForm.nickname} onChange={(e) => setEditForm({ ...editForm, nickname: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">ตำแหน่ง *</label><input required value={editForm.position} onChange={(e) => setEditForm({ ...editForm, position: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div sm:col-span="2"><label className="mb-1 block text-xs font-semibold text-slate-700">สังกัด</label><input value={editForm.department} onChange={(e) => setEditForm({ ...editForm, department: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">บทบาทสิทธิ์ *</label><select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"><option value="requester">ผู้ขอใช้รถ</option><option value="admin">เจ้าหน้าที่จัดการรถ (Admin)</option><option value="head_of_dept">หัวหน้าฝ่ายการศึกษา</option><option value="driver">พนักงานขับรถ</option></select></div>
            {editForm.role === 'driver' ? (<div><label className="mb-1 block text-xs font-semibold text-slate-700">สังกัดคนขับ *</label><select value={editForm.driver_dept_type} onChange={(e) => setEditForm({ ...editForm, driver_dept_type: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"><option value="education">ฝ่ายการศึกษา</option><option value="other">ฝ่ายอื่น / สำนักงานเขต</option></select></div>) : null}
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">สถานะ *</label><select value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500"><option value="active">ใช้งาน</option><option value="inactive">ระงับการใช้งาน</option></select></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">เบอร์โทรศัพท์</label><input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
            <div><label className="mb-1 block text-xs font-semibold text-slate-700">LINE User ID</label><input value={editForm.line_user_id} onChange={(e) => setEditForm({ ...editForm, line_user_id: e.target.value })} className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500" /></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-3">
            <button type="button" onClick={() => setEditingMember(null)} className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">ยกเลิก</button>
            <button type="submit" disabled={busy} className="rounded-xl bg-brand-700 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-800 disabled:opacity-60">บันทึกการแก้ไข</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
