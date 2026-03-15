/**
 * 알림 발송 시스템 (카카오 알림톡)
 */

import { kakaoAlimtalk } from '../kakao-alimtalk'
import { supabase } from '../supabase'
import { 
  getMessageTemplate, 
  type MessageType, 
  type TemplateVariables 
} from './templates'
import { 
  ALIMTALK_TEMPLATE_IDS, 
  convertToAlimtalkVariables,
  ALIMTALK_TEMPLATE_CONTENTS 
} from './alimtalk-templates'

export interface SendNotificationParams {
  type: MessageType
  phone: string
  variables: TemplateVariables
  bookingId?: string
  userId?: string
  scheduledAt?: Date
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
  const { type, phone, variables, bookingId, userId, scheduledAt } = params

  try {
    // 1. 알림톡 템플릿 ID 가져오기
    const templateId = ALIMTALK_TEMPLATE_IDS[type]
    if (!templateId) {
      throw new Error(`Unknown message type: ${type}`)
    }

    // 2. 템플릿 변수를 알림톡 형식으로 변환
    const alimtalkVars = convertVariablesForAlimtalk(type, variables)

    // 3. 발송 로그 생성
    const { data: log, error: logError } = await supabase
      .from('notification_logs')
      .insert({
        message_type: type,
        recipient_phone: phone,
        recipient_name: variables.name,
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

    // 4. 예약 발송이면 로그만 생성하고 리턴
    if (scheduledAt) {
      // 알림톡 예약 발송
      const result = await kakaoAlimtalk.sendScheduledAlimtalk(
        phone,
        templateId,
        scheduledAt,
        alimtalkVars
      )

      if (result.success) {
        await supabase
          .from('notification_logs')
          .update({
            status: 'scheduled',
            aligo_msg_id: result.groupId,
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
    }

    // 5. 즉시 발송 (카카오 알림톡)
    const result = await kakaoAlimtalk.sendAlimtalk(
      phone,
      templateId,
      alimtalkVars
    )

    // 6. 발송 결과 업데이트
    if (result.success) {
      await supabase
        .from('notification_logs')
        .update({
          status: 'sent',
          aligo_msg_id: result.messageId,
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
 * 템플릿 변수를 알림톡 변수명으로 변환
 * 
 * 예:
 *   variables.name → #{이름}
 *   variables.date → #{날짜}
 *   variables.time → #{시간}
 */
function convertVariablesForAlimtalk(
  type: MessageType,
  variables: TemplateVariables
): Record<string, string> {
  // 변수명 매핑 (영어 → 한글)
  const mapping: Record<string, string> = {
    name: '이름',
    household: '세대',
    date: '날짜',
    time: '시간',
    space: '공간',
    amount: '금액',
    account: '계좌',
    deadline: '입금기한',
    reason: '사유',
    season: '계절',
    count: '건수',
    list: '목록',
    adminUrl: '관리자URL',
    phone: '전화',
  }

  const alimtalkVars: Record<string, string> = {}

  for (const [englishKey, value] of Object.entries(variables)) {
    if (value === undefined) continue

    const koreanKey = mapping[englishKey] || englishKey
    alimtalkVars[koreanKey] = String(value)
  }

  // 4-2 (1시간 전 리마인더) 특수 처리
  if (type === '4-2') {
    const season = variables.season || 'summer'
    const seasonMessage = season === 'summer' 
      ? '더운 날씨, 시원하게 보내세요!' 
      : '따뜻하게 입고 오세요!'
    alimtalkVars['안내메시지'] = seasonMessage
  }

  return alimtalkVars
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
    sent: data?.filter(l => l.status === 'sent').length || 0,
    failed: data?.filter(l => l.status === 'failed').length || 0,
    pending: data?.filter(l => l.status === 'pending').length || 0,
    byType: {} as Record<string, number>,
  }

  data?.forEach(log => {
    stats.byType[log.message_type] = (stats.byType[log.message_type] || 0) + 1
  })

  return stats
}
