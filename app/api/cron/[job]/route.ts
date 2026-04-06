/**
 * 크론 작업 API 엔드포인트
 * 
 * GET /api/cron/[job]
 * 
 * Authorization: Bearer {CRON_SECRET}
 * 
 * Jobs:
 * - auto-cancel: 미입금 자동 취소 (00:00)
 * - day-before-reminder: 전날 리마인더 (09:00)
 * - payment-reminder-d7: 입금 리마인더 D-7 (13:00)
 * - payment-reminder-d5: 입금 리마인더 D-5 (13:00)
 * - payment-reminder-d2: 입금 리마인더 D-2 (13:00)
 * - finance-alert-first: 재무 1차 알림 (21:00)
 * - finance-alert-follow: 재무 2차 알림 (16:00)
 * - finance-alert-final: 재무 최종 알림 (23:30)
 * - same-day-reminder: 1시간 전 리마인더 (매시간)
 */

import { NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth, withCronLogging } from '@/lib/cron/wrapper'
import {
  autoCancelUnpaid,
  autoCancelPrepaid,
  dayBeforeReminder,
  paymentReminder,
  financeAlert,
  sameDayReminder,
  prepaidPaymentReminder,
  prepaidFinalReminder,
} from '@/lib/cron/jobs'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: { job: string } }
) {
  // 인증 검증
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  const job = params.job

  try {
    let result: any

    switch (job) {
      case 'auto-cancel':
        result = await withCronLogging('auto-cancel', autoCancelUnpaid)
        break

      case 'prepaid-auto-cancel':
        result = await withCronLogging('prepaid-auto-cancel', autoCancelPrepaid)
        break

      case 'day-before-reminder':
        result = await withCronLogging('day-before-reminder', dayBeforeReminder)
        break

      case 'payment-reminder-d7':
        result = await withCronLogging('payment-reminder-d7', () =>
          paymentReminder(7)
        )
        break

      case 'payment-reminder-d5':
        result = await withCronLogging('payment-reminder-d5', () =>
          paymentReminder(5)
        )
        break

      case 'payment-reminder-d2':
        result = await withCronLogging('payment-reminder-d2', () =>
          paymentReminder(2)
        )
        break

      case 'finance-alert-first':
        result = await withCronLogging('finance-alert-first', () =>
          financeAlert('first')
        )
        break

      case 'finance-alert-follow':
        result = await withCronLogging('finance-alert-follow', () =>
          financeAlert('follow')
        )
        break

      case 'finance-alert-final':
        result = await withCronLogging('finance-alert-final', () =>
          financeAlert('final')
        )
        break

      case 'same-day-reminder':
        result = await withCronLogging('same-day-reminder', sameDayReminder)
        break

      case 'prepaid-payment-reminder':
        result = await withCronLogging('prepaid-payment-reminder', prepaidPaymentReminder)
        break

      case 'prepaid-final-reminder':
        result = await withCronLogging('prepaid-final-reminder', prepaidFinalReminder)
        break

      default:
        return NextResponse.json(
          { error: 'Unknown job', job },
          { status: 400 }
        )
    }

    return NextResponse.json({
      success: true,
      job,
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error(`크론 작업 실패 (${job}):`, error)
    return NextResponse.json(
      {
        success: false,
        job,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
