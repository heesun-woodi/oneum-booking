import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session'
import { createServiceRoleClient } from '@/lib/supabase/server'

/**
 * 서버측 관리자 확인.
 *
 * 신원은 반드시 httpOnly 서명 쿠키에서 읽는다. 클라이언트가 보낸 id 를 믿으면 안 된다 —
 * 예전에는 getBookings() 가 select('*') 로 공개 달력에 user_id 까지 내려보냈고,
 * 관리자가 개인 예약을 한 번이라도 하면 그 행에서 관리자 UUID 가 공개됐다.
 * 그 값을 인자로 받던 구조에서는 공개 데이터만으로 이 검사를 통과할 수 있었다.
 * 지금은 응답이 컬럼 화이트리스트로 좁혀졌지만, 신원을 클라이언트가 '주장'하는
 * 구조 자체를 두지 않는다.
 *
 * 쿠키는 '누구인지'만 말해주므로, 실제 권한은 호출 시점에 DB 에서 다시 읽는다
 * (권한이 회수된 관리자의 쿠키가 만료 전까지 남아 있을 수 있다).
 */
export async function assertAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const adminId = verifyAdminSessionToken(cookies().get(ADMIN_SESSION_COOKIE)?.value)
  if (!adminId) {
    return { ok: false, error: '관리자 인증이 만료되었습니다. 다시 로그인해주세요.' }
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, is_admin, status, deleted_at')
    .eq('id', adminId)
    .maybeSingle()

  if (error) throw error
  if (!data || !data.is_admin || data.status !== 'approved' || data.deleted_at) {
    return { ok: false, error: '관리자 권한이 없습니다.' }
  }

  return { ok: true, adminId }
}
