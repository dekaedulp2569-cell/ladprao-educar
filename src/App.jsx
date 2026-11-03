import { useState } from 'react'
import { useAuth } from './context/AuthContext'
import { ROLE, classNames } from './lib/helpers'
import { LoginModal } from './components/LoginModal'
import { PublicCalendar } from './components/PublicCalendar'
import { CarRequestForm } from './components/CarRequestForm'
import { MyRequests } from './components/MyRequests'
import { AdminDashboard } from './components/AdminDashboard'
import { DriverSchedule } from './components/DriverSchedule'
import { Card } from './components/ui'

function App() {
  const { session, canManage, logout } = useAuth()
  const [view, setView] = useState('calendar')
  const [loginOpen, setLoginOpen] = useState(false)

  const navItems = [
    { id: 'calendar', label: 'ปฏิทินรถ' },
    ...(session && session.role !== 'driver'
      ? [
          { id: 'request', label: 'ขอใช้รถ' },
          { id: 'mine', label: 'คำขอของฉัน' },
        ]
      : []),
    ...(canManage ? [{ id: 'admin', label: 'จัดการคำขอ' }] : []),
    ...(session?.role === 'driver' ? [{ id: 'driver', label: 'งานของฉัน' }] : []),
  ]

  const handleLoggedIn = (role) => {
    if (role === 'admin' || role === 'head_of_dept') setView('admin')
    else if (role === 'driver') setView('driver')
    else setView('request')
  }

  const handleLogout = () => {
    logout()
    setView('calendar')
  }

  const handleSubmitted = (data, target) => {
    if (target === 'calendar') setView('calendar')
    else setView(session ? 'mine' : 'calendar')
  }

  const requireAuth = (content) => {
    if (session) return content
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-2xl">
            🔐
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-800">ต้องเข้าสู่ระบบก่อนใช้งาน</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            เพื่อความปลอดภัยและถูกต้องตามระเบียบราชการ
            การยื่นคำขอและติดตามสถานะต้องระบุตัวตนผู้ใช้งานก่อน
            ส่วนปฏิทินการใช้รถสามารถเปิดดูได้โดยไม่ต้องเข้าสู่ระบบ
          </p>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
            >
              เข้าสู่ระบบ
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className="rounded-xl border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              ดูปฏิทินรถ
            </button>
          </div>
        </Card>
      </div>
    )
  }

  const requireRole = (content) => {
    if (!session) return requireAuth(content)
    if (canManage || session.role === 'driver') return content
    return (
      <div className="mx-auto max-w-lg py-10">
        <Card className="p-8 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 text-2xl">
            ⚠️
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-800">บัญชีนี้ไม่มีสิทธิ์เข้าถึง</h2>
          <p className="mt-2 text-sm text-slate-500">
            หน้านี้สำหรับเจ้าหน้าที่ผู้จัดการรถและหัวหน้าฝ่ายการศึกษาเท่านั้น
            ปัจจุบันคุณเข้าสู่ระบบในบทบาท {ROLE[session.role]}
          </p>
          <button
            type="button"
            onClick={handleLogout}
            className="mt-5 rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-800"
          >
            ออกจากระบบเพื่อเปลี่ยนบทบาท
          </button>
        </Card>
      </div>
    )
  }

  const renderView = () => {
    if (view === 'calendar') return <PublicCalendar />
    if (view === 'request') {
      return requireAuth(<CarRequestForm onSubmitted={handleSubmitted} />)
    }
    if (view === 'mine') return requireAuth(<MyRequests />)
    if (view === 'admin') return requireRole(<AdminDashboard />)
    if (view === 'driver') {
      if (!session) return requireAuth(null)
      if (session.role !== 'driver' && !canManage) return requireRole(null)
      return <DriverSchedule />
    }
    return <PublicCalendar />
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-brand-800/40 bg-gradient-to-r from-brand-800 to-emerald-800 text-white shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setView('calendar')}
            className="flex items-center gap-3 text-left"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-xl">
              🚗
            </span>
            <span>
              <span className="block text-sm font-bold leading-tight sm:text-base">
                ระบบขอใช้รถ ฝ่ายการศึกษา
              </span>
              <span className="block text-[11px] text-brand-100 sm:text-xs">
                สำนักงานเขตลาดพร้าว · กรุงเทพมหานคร
              </span>
            </span>
          </button>

          <div className="flex items-center gap-2">
            {session ? (
              <>
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium leading-tight">{session.name}</p>
                  <p className="text-[11px] text-brand-100">{ROLE[session.role]}</p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-white/30 bg-white/10 px-3 py-2 text-xs font-medium transition hover:bg-white/20"
                >
                  ออกจากระบบ
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand-800 transition hover:bg-brand-50"
              >
                เข้าสู่ระบบ
              </button>
            )}
          </div>
        </div>

        <nav className="no-scrollbar mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3 pb-2 sm:px-6">
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={classNames(
                'whitespace-nowrap rounded-lg px-3 py-2 text-xs font-medium transition sm:text-sm',
                view === item.id
                  ? 'bg-white text-brand-800 shadow-sm'
                  : 'text-brand-100 hover:bg-white/10 hover:text-white',
              )}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-7">{renderView()}</main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear() + 543} ฝ่ายการศึกษา สำนักงานเขตลาดพร้าว</p>
          <p className="text-slate-400">
            ระบบขอใช้รถและจัดสรรคิวรถ · ข้อมูลเชื่อมต่อ Supabase · พร้อมรองรับ LINE Login และ LINE Notify
          </p>
        </div>
      </footer>

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onLoggedIn={handleLoggedIn}
      />
    </div>
  )
}

export default App
