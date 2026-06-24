/**
 * Web Push 클라이언트 헬퍼 (브라우저 전용)
 * - 서비스 워커 등록, 권한 요청, 구독/해제
 * - 구독 정보는 서버 액션(app/actions/push.ts)으로 영속화
 */
import { savePushSubscription, removePushSubscription } from '@/app/actions/push'

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || ''

export type PushPermission = 'unsupported' | 'default' | 'granted' | 'denied'

/** 브라우저가 Web Push를 지원하는지 */
export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

/** 현재 알림 권한 상태 */
export function getPermission(): PushPermission {
  if (!isPushSupported()) return 'unsupported'
  return Notification.permission as PushPermission
}

/**
 * PWA가 홈 화면에 설치(standalone)되어 실행 중인지.
 * iOS Safari는 설치된 경우에만 Web Push가 동작한다.
 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  // iOS Safari
  if ((navigator as any).standalone === true) return true
  // 그 외 브라우저
  return window.matchMedia('(display-mode: standalone)').matches
}

/** iOS(아이폰/아이패드) 여부 */
export function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false
  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    // iPadOS 13+ 는 Mac으로 위장하므로 터치 포인트로 보강
    (navigator.platform === 'MacIntel' && (navigator as any).maxTouchPoints > 1)
  )
}

/** base64url VAPID 키 → Uint8Array */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i)
  return output
}

/** 서비스 워커 등록 (이미 등록돼 있으면 재사용) */
async function registerServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/')
  if (existing) return existing
  return navigator.serviceWorker.register('/sw.js', { scope: '/' })
}

function serializeSubscription(sub: PushSubscription) {
  const json = sub.toJSON()
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || '',
    auth: json.keys?.auth || '',
  }
}

export interface SubscribeResult {
  success: boolean
  reason?: 'unsupported' | 'denied' | 'no-vapid' | 'error'
  error?: string
}

/**
 * 푸시 구독 + 서버 저장.
 * @param userId 로그인 사용자 id (oneumSession.userId)
 */
export async function subscribeToPush(userId: string): Promise<SubscribeResult> {
  if (!isPushSupported()) return { success: false, reason: 'unsupported' }
  if (!VAPID_PUBLIC_KEY) return { success: false, reason: 'no-vapid' }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { success: false, reason: 'denied' }

    const registration = await registerServiceWorker()
    await navigator.serviceWorker.ready

    // 기존 구독 재사용 또는 신규 구독
    let subscription = await registration.pushManager.getSubscription()
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
      })
    }

    const result = await savePushSubscription(userId, {
      ...serializeSubscription(subscription),
      userAgent: navigator.userAgent,
    })

    if (!result.success) return { success: false, reason: 'error', error: result.error }
    return { success: true }
  } catch (err: any) {
    console.error('푸시 구독 실패:', err)
    return { success: false, reason: 'error', error: err?.message }
  }
}

/** 푸시 구독 해제 + 서버 삭제 */
export async function unsubscribeFromPush(userId: string): Promise<{ success: boolean }> {
  if (!isPushSupported()) return { success: false }
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await removePushSubscription(userId, endpoint)
    }
    return { success: true }
  } catch (err) {
    console.error('푸시 구독 해제 실패:', err)
    return { success: false }
  }
}

/** 이 브라우저에 활성 구독이 있는지 (UI 토글 초기 상태용) */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!isPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.getRegistration('/')
    const subscription = await registration?.pushManager.getSubscription()
    return !!subscription
  } catch {
    return false
  }
}
