/**
 * 선불권 관련 유틸리티 함수
 * Phase 6.5: 클라이언트 사이드 헬퍼 함수
 */

import { PrepaidPurchase } from '@/app/actions/prepaid'

/**
 * 유효한 선불권의 총 잔여 시간 계산
 */
export function getTotalRemainingHours(purchases: PrepaidPurchase[]): number {
  const now = new Date()
  
  return purchases
    .filter(p => p.status === 'paid')
    .filter(p => p.expires_at && new Date(p.expires_at) > now)
    .filter(p => p.remaining_hours > 0)
    .reduce((sum, p) => sum + p.remaining_hours, 0)
}

/**
 * 예약에 필요한 선불권 사용 계획 계산
 */
export function calculatePrepaidUsage(
  purchases: PrepaidPurchase[],
  requestedHours: number
): {
  prepaidHours: number
  regularHours: number
  amount: number
  isFullyPrepaid: boolean
  usedPurchases: Array<{ id: string; hours: number }>
} {
  const now = new Date()
  
  // 사용 가능한 선불권 (유효기간 임박 순, 잔여 시간 적은 순)
  const availablePurchases = purchases
    .filter(p => p.status === 'paid')
    .filter(p => p.expires_at && new Date(p.expires_at) > now)
    .filter(p => p.remaining_hours > 0)
    .sort((a, b) => {
      const dateA = new Date(a.expires_at!).getTime()
      const dateB = new Date(b.expires_at!).getTime()
      if (dateA !== dateB) return dateA - dateB
      return a.remaining_hours - b.remaining_hours
    })
  
  let remainingHours = requestedHours
  let prepaidHours = 0
  const usedPurchases: Array<{ id: string; hours: number }> = []
  
  for (const purchase of availablePurchases) {
    if (remainingHours === 0) break
    
    const hoursToUse = Math.min(purchase.remaining_hours, remainingHours)
    prepaidHours += hoursToUse
    remainingHours -= hoursToUse
    usedPurchases.push({ id: purchase.id, hours: hoursToUse })
  }
  
  const regularHours = remainingHours
  const amount = regularHours * 14000
  const isFullyPrepaid = regularHours === 0
  
  return {
    prepaidHours,
    regularHours,
    amount,
    isFullyPrepaid,
    usedPurchases
  }
}
