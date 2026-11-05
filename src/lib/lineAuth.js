import liff from '@line/liff'
import { supabase } from './supabase'

const LIFF_ID = import.meta.env.VITE_LINE_LIFF_ID || '2012159727-HtVN6Mme'

let liffInitialization

/** อ่าน payload ของ JWT โดยไม่ต้องตรวจลายเซ็น (ใช้เช็คเวลาหมดอายุเท่านั้น) */
function decodeJwtPayload(token) {
  try {
    const part = token.split('.')[1]
    if (!part) return null
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/** ID token ของ LINE มีอายุราว 1 ชั่วโมง — เผื่อเวลา 60 วินาทีเพื่อกันหมดอายุระหว่างทาง */
function isExpiredIdToken(token, skewSeconds = 60) {
  const payload = decodeJwtPayload(token)
  if (!payload?.exp) return true
  return payload.exp * 1000 <= Date.now() + skewSeconds * 1000
}

function forceLineLogin() {
  if (liff.isLoggedIn()) liff.logout()
  liff.login({ redirectUri: window.location.href })
}

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
  // token หายหรือหมดอายุ: ปล่อยให้ผู้ใช้กด "เข้าสู่ระบบด้วย LINE" เพื่อขอ token ใหม่
  if (!idToken || isExpiredIdToken(idToken)) return null

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
  const idToken = liff.isLoggedIn() ? liff.getIDToken() : null
  // ถ้ายังไม่ล็อกอิน หรือ token เก่าหมดอายุ ให้บังคับ LINE Login ใหม่เพื่อขอ ID token สด
  if (!idToken || isExpiredIdToken(idToken)) {
    forceLineLogin()
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
