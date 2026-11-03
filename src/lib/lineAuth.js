import liff from '@line/liff'
import { supabase } from './supabase'

const LIFF_ID = import.meta.env.VITE_LINE_LIFF_ID || '2012159727-HtVN6Mme'

let liffInitialization

export function initializeLineLogin() {
  if (!liffInitialization) {
    liffInitialization = liff.init({ liffId: LIFF_ID })
  }
  return liffInitialization
}

export async function completeLineLogin() {
  await initializeLineLogin()
  if (!liff.isLoggedIn()) return null
  const idToken = liff.getIDToken()
  if (!idToken) {
    throw new Error('ไม่พบ LINE ID token กรุณาเปิด LINE Login ใหม่อีกครั้ง')
  }

  const { data, error } = await supabase.functions.invoke('line-auth', {
    body: { idToken },
  })

  if (error) {
    let detail = error.message
    if (error.context instanceof Response) {
      try {
        const responseBody = await error.context.clone().json()
        if (typeof responseBody?.error === 'string') detail = responseBody.error
      } catch {
        detail = error.message
      }
    }
    throw new Error(`ยืนยันบัญชี LINE ไม่สำเร็จ: ${detail}`)
  }

  if (!data?.email || !data?.hashedToken) {
    throw new Error('ระบบยืนยันตัวตนตอบกลับไม่ครบ กรุณาลองอีกครั้ง')
  }

  const { error: sessionError } = await supabase.auth.verifyOtp({
    token_hash: data.hashedToken,
    type: 'magiclink',
  })

  if (sessionError) {
    throw new Error(`สร้างเซสชันเข้าสู่ระบบไม่สำเร็จ: ${sessionError.message}`)
  }

  return data.approvalStatus
}

export async function beginLineLogin() {
  await initializeLineLogin()
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href })
    return null
  }
  return completeLineLogin()
}

export async function endLineLogin() {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(`ออกจากระบบ Supabase ไม่สำเร็จ: ${error.message}`)
  await initializeLineLogin()
  if (liff.isLoggedIn()) liff.logout()
}
