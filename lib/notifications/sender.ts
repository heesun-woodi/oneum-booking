/**
 * 알림 발송 시스템
 */
import { normalizePhone } from '../phone-utils'

import { solapi } from '../solapi'
import { supabase } from '../supabase'
import { createServiceRoleClient } from '../supabase/server'
import { isPushConfigured, sendPushToUser } from '../push/server'
import {
  getMessageTemplate,
  type MessageType,
  type TemplateVariables
} from './templates'

/**
 * 메시지 타입별 알림 클릭 시 이동 URL.
 * 7-x(선불권) → 선불권 탭, 그 외 사용자 알림 → 마이페이지.
 */
function getPushUrl(type: string): string {
  if (type.startsWith('7-')) return '/mypage?tab=prepaid'
  return '/mypage'
}

/**
 * phone으로 등록(승인) 사용자 id 조회. 푸시 수신자 식별용.
 * 비회원/관리자 env 번호는 매칭되지 않아 자동으로 문자 폴백된다.
 */
async function resolveUserIdByPhone(phone: string): Promise<string | undefined> {
  const normalized = normalizePhone(phone)
  if (!normalized) return undefined
  try {
    const admin = await createServiceRoleClient()
    const { data } = await admin
      .from('users')
      .select('id')
      .eq('phone', normalized)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
    return data && data.length > 0 ? data[0].id : undefined
  } catch {
    return undefined
  }
}

/**
 * DB 템플릿에서 {variable} 플레이스홀더를 실제 값으로 치환
 */
function applyDbTemplateVariables(content: string, variables: TemplateVariables): string {
  return content.replace(/\{(\w+)\}/g, (_, key) => variables[key] ?? `{${key}}`)
}

/**
 * DB에서 활성화된 템플릿 조회 (RLS: 누구나 SELECT 가능)
 */
async function fetchDbTemplate(
  type: string
): Promise<{ title: string; content: string } | null> {
  const { data, error } = await supabase
    .from('message_templates')
    .select('title, content')
    .eq('type_code', type)
    .eq('is_active', true)
    .single()

  if (error || !data) return null
  return data
}

export interface SendNotificationParams {
  type: MessageType
  phone: string
  variables: TemplateVariables
  bookingId?: string
  userId?: string
  scheduledAt?: Date
  recipientName?: string  // 실제 수신자 이름 (미지정 시 variables.name 사용)
}

export interface SendNotificationResult {
  success: boolean
  logId?: string
  error?: string
}

/**
 * 알림 발송 (즉시 또는 예약)
 */
export async function sendNotification(
  params: SendNotificationParams
): Promise<SendNotificationResult> {
  const { type, phone, variables, bookingId, userId, scheduledAt, recipientName } = params

  try {
    // 1. 메시지 템플릿 가져오기 (DB 우선, 없으면 하드코딩 폴백)
    let title: string
    let message: string

    const dbTemplate = await fetchDbTemplate(type)
    if (dbTemplate) {
      title = dbTemplate.title
      message = applyDbTemplateVariables(dbTemplate.content, variables)
    } else {
      const fallback = getMessageTemplate(type, variables)
      title = fallback.title
      message = fallback.message
    }

    // 2. 발송 로그 생성
    const { data: log, error: logError } = await supabase
      .from('notification_logs')
      .insert({
        message_type: type,
        recipient_phone: normalizePhone(phone),
        recipient_name: recipientName ?? variables.name,
        booking_id: bookingId,
        user_id: userId,
        status: scheduledAt ? 'pending' : 'pending',
        scheduled_at: scheduledAt?.toISOString(),
      })
      .select()
      .single()

    if (logError) {
      throw new Error(`로그 생성 실패: ${logError.message}`)
    }

    // 3. 예약 발송이면 로그만 생성하고 리턴
    if (scheduledAt) {
      return {
        success: true,
        logId: log.id,
      }
    }

    // 4. 푸시 우선 시도 (등록 사용자 + 활성 구독이 있으면 푸시, 없으면 문자 폴백)
    const resolvedUserId = isPushConfigured()
      ? userId ?? (await resolveUserIdByPhone(phone))
      : undefined
    if (resolvedUserId) {
      const push = await sendPushToUser(resolvedUserId, {
        title,
        body: message,
        url: getPushUrl(type),
        tag: bookingId || type,
      })
      if (push.success) {
        await supabase
          .from('notification_logs')
          .update({
            status: 'sent',
            channel: 'push',
            sent_at: new Date().toISOString(),
          })
          .eq('id', log.id)

        return {
          success: true,
          logId: log.id,
        }
      }
    }

    // 5. 문자(SMS/LMS) 폴백 발송
    const result = await solapi.sendAuto(normalizePhone(phone), message, title)

    // 6. 발송 결과 업데이트
    if (result.success) {
      await supabase
        .from('notification_logs')
        .update({
          status: 'sent',
          aligo_msg_id: result.msgId,
          sent_at: new Date().toISOString(),
        })
        .eq('id', log.id)

      return {
        success: true,
        logId: log.id,
      }
    } else {
      await supabase
        .from('notification_logs')
        .update({
          status: 'failed',
          error_message: result.error,
        })
        .eq('id', log.id)

      return {
        success: false,
        error: result.error,
        logId: log.id,
      }
    }
  } catch (error: any) {
    console.error('알림 발송 실패:', error)
    return {
      success: false,
      error: error.message || '알 수 없는 오류',
    }
  }
}

/**
 * 예약 발송 처리 (크론에서 호출)
 */
export async function processScheduledNotifications(): Promise<{
  processed: number
  failed: number
}> {
  try {
    const now = new Date()

    // 발송 대기 중인 알림 조회
    const { data: logs, error } = await supabase
      .from('notification_logs')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_at', now.toISOString())
      .limit(100)

    if (error) throw error
    if (!logs || logs.length === 0) return { processed: 0, failed: 0 }

    let processed = 0
    let failed = 0

    for (const log of logs) {
      // 메시지 재구성 (로그에서 변수 복원 필요 - 추후 개선)
      // 지금은 예약 발송을 크론에서 직접 처리하므로 이 함수는 나중에 사용

      processed++
    }

    return { processed, failed }
  } catch (error) {
    console.error('예약 발송 처리 실패:', error)
    return { processed: 0, failed: 0 }
  }
}

/**
 * 발송 통계
 */
export async function getNotificationStats(startDate?: Date, endDate?: Date) {
  const query = supabase
    .from('notification_logs')
    .select('status, message_type, created_at')

  if (startDate) {
    query.gte('created_at', startDate.toISOString())
  }
  if (endDate) {
    query.lte('created_at', endDate.toISOString())
  }

  const { data, error } = await query

  if (error) throw error

  const stats = {
    total: data?.length || 0,
    sent: data?.filter((l: any) => l.status === 'sent').length || 0,
    failed: data?.filter((l: any) => l.status === 'failed').length || 0,
    pending: data?.filter((l: any) => l.status === 'pending').length || 0,
    byType: {} as Record<string, number>,
  }

  data?.forEach((log: any) => {
    stats.byType[log.message_type] = (stats.byType[log.message_type] || 0) + 1
  })

  return stats
}
