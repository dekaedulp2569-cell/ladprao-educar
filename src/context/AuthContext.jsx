import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { completeLineLogin, endLineLogin, initializeLineLogin } from '../lib/lineAuth'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)

  useEffect(() => {
    let active = true

    const loadProfile = async (authSession) => {
      if (!authSession?.user) {
        if (active) {
          setSession(null)
          setAuthLoading(false)
        }
        return
      }

      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, full_name, position, department, role, approval_status')
        .eq('auth_user_id', authSession.user.id)
        .maybeSingle()

      if (!active) return
      if (error) {
        console.error('โหลดโปรไฟล์ผู้ใช้ไม่สำเร็จ:', error.message)
        setSession(null)
      } else if (data) {
        setSession({
          userId: authSession.user.id,
          profileId: data.id,
          name: data.full_name,
          position: data.position,
          department: data.department,
          role: data.role,
          approvalStatus: data.approval_status,
        })
      } else {
        setSession(null)
      }
      setAuthLoading(false)
    }

    const initialize = async () => {
      try {
        await initializeLineLogin()
      } catch (error) {
        console.error('เริ่มต้น LINE Login ไม่สำเร็จ:', error)
      }

      const { data, error } = await supabase.auth.getSession()
      if (error) {
        console.error('โหลดเซสชันไม่สำเร็จ:', error.message)
        if (active) setAuthLoading(false)
      } else {
        if (!data.session) {
          try {
            await completeLineLogin()
          } catch (loginError) {
            console.error('เข้าสู่ระบบ LINE ไม่สำเร็จ:', loginError)
          }
        }
        const { data: refreshed, error: refreshError } = await supabase.auth.getSession()
        if (refreshError) {
          console.error('โหลดเซสชัน LINE ไม่สำเร็จ:', refreshError.message)
          if (active) setAuthLoading(false)
        } else {
          await loadProfile(refreshed.session || data.session)
        }
      }
    }

    void initialize()
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, authSession) => {
      setTimeout(() => void loadProfile(authSession), 0)
    })

    return () => {
      active = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const logout = async () => {
    await endLineLogin()
    setSession(null)
  }

  const value = useMemo(
    () => ({
      session,
      logout,
      authLoading,
      isApproved: session?.approvalStatus === 'approved',
      isLoggedIn: Boolean(session),
      isAdmin: session?.approvalStatus === 'approved' && session?.role === 'admin',
      canManage:
        session?.approvalStatus === 'approved' &&
        (session?.role === 'admin' || session?.role === 'head_of_dept'),
    }),
    [session, authLoading],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth ต้องถูกใช้ภายใน AuthProvider')
  }
  return context
}
