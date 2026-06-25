'use server'

/**
 * Web Push 구독 영속화 서버 액션.
 * 구독 endpoint는 민감 정보 → service-role 클라이언트로만 접근(RLS 우회).
 */
import { createServiceRoleClient } from '@/lib/supabase/server'

export interface PushSubscriptionInput {
  endpoint: string
  p256dh: string
  auth: string
  userAgent?: string
}

/**
 * 구독 저장 (endpoint 기준 upsert).
 * 같은 기기가 재구독하면 user_id/keys/last_seen_at 갱신.
 */
export async function savePushSubscription(
  userId: string,
  sub: PushSubscriptionInput
): Promise<{ success: boolean; error?: string }> {
  if (!userId || !sub?.endpoint) {
    return { success: false, error: '잘못된 요청입니다.' }
  }

  try {
    const supabase = await createServiceRoleClient()
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: userId,
          endpoint: sub.endpoint,
          p256dh: sub.p256dh,
          auth: sub.auth,
          user_agent: sub.userAgent ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
      )

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    console.error('푸시 구독 저장 실패:', err)
    return { success: false, error: err?.message || '알 수 없는 오류' }
  }
}

/** 구독 삭제 (해제 시) */
export async function removePushSubscription(
  userId: string,
  endpoint: string
): Promise<{ success: boolean; error?: string }> {
  if (!endpoint) return { success: false, error: '잘못된 요청입니다.' }

  try {
    const supabase = await createServiceRoleClient()
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', endpoint)

    if (error) return { success: false, error: error.message }
    return { success: true }
  } catch (err: any) {
    console.error('푸시 구독 삭제 실패:', err)
    return { success: false, error: err?.message || '알 수 없는 오류' }
  }
}
