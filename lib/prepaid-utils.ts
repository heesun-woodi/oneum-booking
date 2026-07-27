/**
 * 선불권 관련 유틸리티 함수
 * Phase 6.5: 클라이언트 사이드 헬퍼 함수
 *
 * 계산은 lib/booking-policy.ts에 위임한다. 이 파일에서 요금을 다시 계산하지 말 것.
 */

import { PrepaidPurchase } from '@/app/actions/prepaid'
import {
  POLICY_V2_EFFECTIVE_FROM,
  PrepaidLike,
  computeBookingCharge,
  selectUsablePrepaid,
  round1,
} from '@/lib/booking-policy'

/**
 * 유효한 선불권의 총 잔여 시간 계산
 */
export function getTotalRemainingHours(purchases: PrepaidPurchase[]): number {
  return round1(
    selectUsablePrepaid(purchases as unknown as PrepaidLike[]).reduce(
      (sum, p) => sum + Number(p.remaining_hours),
      0
    )
  )
}

/**
 * 예약에 필요한 선불권 사용 계획 계산
 *
 * @deprecated 세대 무료 시간까지 함께 반영하려면 computeBookingCharge를 직접 쓸 것.
 */
export function calculatePrepaidUsage(
  purchases: PrepaidPurchase[],
  requestedHours: number,
  /** 사용일 'YYYY-MM-DD'. 일반 회원 경로는 정책 버전과 무관하므로 기본값을 둔다. */
  bookingDate: string = POLICY_V2_EFFECTIVE_FROM
): {
  prepaidHours: number
  regularHours: number
  amount: number
  isFullyPrepaid: boolean
  usedPurchases: Array<{ id: string; hours: number }>
} {
  const charge = computeBookingCharge({
    userKind: 'member',
    space: 'nolter',
    bookingDate,
    requestedHours,
    freeHoursUsedThisMonth: 0,
    prepaidPurchases: purchases as unknown as PrepaidLike[],
  })

  return {
    prepaidHours: charge.prepaidHours,
    regularHours: charge.regularHours,
    amount: charge.amount,
    isFullyPrepaid: charge.regularHours === 0,
    usedPurchases: charge.deductionPlan.map(p => ({ id: p.purchaseId, hours: p.hoursToDeduct })),
  }
}
