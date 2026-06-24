/**
 * Web Push 서버 발송 (web-push + VAPID).
 * 서버 전용. push_subscriptions를 service-role로 조회/정리한다.
 */
import webpush from 'web-push'
import { createServiceRoleClient } from '../supabase/server'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || ''
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@oneum.app'

let configured = false
function ensureConfigured(): boolean {
  if (configured) return true
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return false
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  configured = true
  return true
}

/** VAPID 키가 설정되어 푸시 발송이 가능한 환경인지 */
export function isPushConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY)
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

export interface SendPushResult {
  /** 하나 이상의 기기에 발송 성공 */
  success: boolean
  /** 조회된 구독 수 */
  subscriptions: number
  /** 발송 성공한 기기 수 */
  delivered: number
}

/**
 * 특정 사용자의 모든 활성 구독으로 푸시 발송.
 * - 만료/무효 구독(404/410)은 테이블에서 삭제(정리).
 * - 하나라도 성공하면 success=true. 구독이 없으면 success=false(→문자 폴백).
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload
): Promise<SendPushResult> {
  if (!userId || !ensureConfigured()) {
    return { success: false, subscriptions: 0, delivered: 0 }
  }

  const supabase = await createServiceRoleClient()
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)

  if (error || !subs || subs.length === 0) {
    return { success: false, subscriptions: 0, delivered: 0 }
  }

  const body = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || '/',
    tag: payload.tag,
  })

  let delivered = 0
  const expiredIds: string[] = []

  await Promise.all(
    subs.map(async (s: any) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body
        )
        delivered++
      } catch (err: any) {
        const status = err?.statusCode
        // 404/410: 구독 만료 → 정리 대상
        if (status === 404 || status === 410) {
          expiredIds.push(s.id)
        } else {
          console.error('푸시 발송 실패:', status, err?.body || err?.message)
        }
      }
    })
  )

  // 만료 구독 정리
  if (expiredIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', expiredIds)
  }

  return { success: delivered > 0, subscriptions: subs.length, delivered }
}
