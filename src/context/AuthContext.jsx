import { createContext, useContext, useMemo, useState } from 'react'

const STORAGE_KEY = 'lp_edu_car_session'

const AuthContext = createContext(null)

function readSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(readSession)

  const login = (nextSession) => {
    const value = {
      ...nextSession,
      loginAt: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    setSession(value)
  }

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY)
    setSession(null)
  }

  const value = useMemo(
    () => ({
      session,
      login,
      logout,
      isLoggedIn: Boolean(session),
      isAdmin: session?.role === 'admin',
      canManage: session?.role === 'admin' || session?.role === 'head_of_dept',
    }),
    [session],
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
