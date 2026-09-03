/**
 * 관리자 세션 (httpOnly 서명 쿠키)
 *
 * 왜 필요한가:
 *   종전 관리자 화면의 신원은 localStorage 의 adminSession.id (= users.id) 하나였고,
 *   서버 액션은 그 값을 인자로 받아 is_admin 여부만 확인했다. 즉 '관리자의 users.id 를
 *   아는 사람 = 관리자'였는데, 그 UUID 는 비밀이 아니다.
 *
 *   getBookings() 는 anon 키로 bookings 를 select('*') 해서 공개 달력에 그대로 내려보낸다.
 *   관리자가 개인 예약을 한 번이라도 하면 그 행의 user_id 로 관리자 UUID 가 공개된다.
 *   (실제로 확인됨: 2026-09-11 놀터 예약 행에 관리자 user_id 노출)
 *   그 값이면 회원 명부 조회도, 남의 선불권을 깎는 예약 생성도 가능했다.
 *
 * 그래서 신원을 클라이언트가 '주장'하지 못하게 한다.
 *   - 로그인 시 서버가 HMAC 으로 서명한 토큰을 httpOnly 쿠키로 심는다
 *   - 서버 액션은 인자가 아니라 그 쿠키에서만 관리자 id 를 읽는다
 *   - httpOnly 라 페이지 스크립트가 읽을 수 없고, 응답 본문에도 실리지 않는다
 *
 * 쿠키는 '누구인지'만 말해준다. 실제 권한(is_admin/status)은 호출 시점에 DB 에서
 * 다시 확인해야 한다 — 권한이 회수된 관리자의 쿠키가 남아 있을 수 있기 때문이다.
 */

import { createHmac, timingSafeEqual } from 'crypto'

export const ADMIN_SESSION_COOKIE = 'oneum_admin_session'

/** 세션 유효기간 (12시간) */
const SESSION_TTL_SECONDS = 12 * 60 * 60

interface AdminSessionPayload {
  /** users.id */
  id: string
  /** 만료 시각 (epoch seconds) */
  exp: number
}

/**
 * 서명 키.
 *
 * 전용 시크릿(ADMIN_SESSION_SECRET)이 있으면 그걸 쓰고, 없으면 서비스 롤 키로 대체한다.
 * 서비스 롤 키는 서버에만 존재하고 엔트로피도 충분해 서명 키로 성립하지만,
 * 키 용도를 섞지 않는 편이 낫다 — 운영 환경에는 ADMIN_SESSION_SECRET 을 따로 두는 것을 권한다.
 */
function signingKey(): string {
  const key = process.env.ADMIN_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) {
    throw new Error('ADMIN_SESSION_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
  }
  return key
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function sign(data: string): string {
  return base64url(createHmac('sha256', signingKey()).update(data).digest())
}

/** 로그인 성공 시 넣을 쿠키 값을 만든다. */
export function createAdminSessionToken(userId: string): string {
  const payload: AdminSessionPayload = {
    id: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  }
  const body = base64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

/**
 * 쿠키 값을 검증해 users.id 를 돌려준다. 위조·만료면 null.
 *
 * 서명 비교는 timingSafeEqual 로 한다. 문자열 '===' 는 앞에서부터 비교하다 첫 불일치에서
 * 멈추므로, 응답 시간 차이로 올바른 서명을 한 바이트씩 맞춰갈 여지를 준다.
 */
export function verifyAdminSessionToken(token: string | undefined): string | null {
  if (!token) return null

  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null

  const body = token.slice(0, dot)
  const provided = token.slice(dot + 1)
  const expected = sign(body)

  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null

  try {
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    ) as AdminSessionPayload

    if (!payload?.id) return null
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) return null

    return payload.id
  } catch {
    return null
  }
}

/** cookies().set() 에 넘길 옵션 */
export function adminSessionCookieOptions() {
  return {
    httpOnly: true,
    // 로컬 개발은 http 라 secure 를 켜면 쿠키가 아예 저장되지 않는다.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  }
}
