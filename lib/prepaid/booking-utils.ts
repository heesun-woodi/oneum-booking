import { createServiceRoleClient } from '@/lib/supabase/server'

// ===== 타입 정의 =====

export interface PrepaidPurchase {
  id: string
  user_id: string
  total_hours: number
  remaining_hours: number
  expires_at: string
  status: string
}

export interface DeductionPlan {
  purchaseId: string
  hoursToDeduct: number
}

export interface BookingCost {
  prepaidHours: number
  regularHours: number
  totalHours: number
  amount: number
  paymentMethod: 'free' | 'regular' | 'prepaid' | 'mixed'
}

export interface PrepaidSummary {
  purchases: PrepaidPurchase[]
  totalRemainingHours: number
  earliestExpiry: string | null
}

// ===== 함수 구현 =====

/**
 * 사용자의 유효한 선불권 조회 (만료일 오름차순)
 */
export async function getAvailablePrepaidPurchases(
  userId: string,
  bookingDate: Date
): Promise<PrepaidPurchase[]> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase
    .from('prepaid_purchases')
    .select('id, user_id, total_hours, remaining_hours, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .gt('remaining_hours', 0)
    .gt('expires_at', bookingDate.toISOString())
    .order('expires_at', { ascending: true })
    .order('remaining_hours', { ascending: true })
  
  if (error) {
    console.error('선불권 조회 오류:', error)
    return []
  }
  
  return data || []
}

/**
 * 선불권 요약 정보 조회
 */
export async function getPrepaidSummary(
  userId: string
): Promise<PrepaidSummary> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase
    .from('prepaid_purchases')
    .select('id, user_id, total_hours, remaining_hours, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .gt('remaining_hours', 0)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
  
  if (error || !data) {
    return { purchases: [], totalRemainingHours: 0, earliestExpiry: null }
  }
  
  const totalRemainingHours = data.reduce((sum, p) => sum + p.remaining_hours, 0)
  const earliestExpiry = data.length > 0 ? data[0].expires_at : null
  
  return { purchases: data, totalRemainingHours, earliestExpiry }
}

/**
 * 선불권 차감 계획 수립
 */
export function createDeductionPlan(
  prepaidPurchases: PrepaidPurchase[],
  hoursNeeded: number
): { plan: DeductionPlan[]; prepaidHours: number; regularHours: number } {
  const plan: DeductionPlan[] = []
  let remainingNeed = hoursNeeded
  
  for (const purchase of prepaidPurchases) {
    if (remainingNeed <= 0) break
    
    const toDeduct = Math.min(remainingNeed, purchase.remaining_hours)
    plan.push({
      purchaseId: purchase.id,
      hoursToDeduct: toDeduct
    })
    remainingNeed -= toDeduct
  }
  
  const prepaidHours = hoursNeeded - remainingNeed
  const regularHours = remainingNeed
  
  return { plan, prepaidHours, regularHours }
}

/**
 * 예약 비용 계산
 */
export async function calculateBookingCost(
  userId: string | undefined,
  hours: number,
  bookingDate: Date,
  isMember: boolean,
  monthlyFreeHoursLeft?: number  // 세대 회원 잔여 무료 시간
): Promise<BookingCost> {
  // 세대 회원이고 무료 시간 남음
  if (isMember && monthlyFreeHoursLeft !== undefined && monthlyFreeHoursLeft >= hours) {
    return {
      prepaidHours: 0,
      regularHours: 0,
      totalHours: hours,
      amount: 0,
      paymentMethod: 'free'
    }
  }
  
  // 로그인 안 했으면 일반 결제
  if (!userId) {
    return {
      prepaidHours: 0,
      regularHours: hours,
      totalHours: hours,
      amount: hours * 14000,
      paymentMethod: 'regular'
    }
  }
  
  // 선불권 조회
  const prepaidPurchases = await getAvailablePrepaidPurchases(userId, bookingDate)
  const { prepaidHours, regularHours } = createDeductionPlan(prepaidPurchases, hours)
  
  // 결제 방식 결정
  let paymentMethod: BookingCost['paymentMethod']
  if (prepaidHours === hours) {
    paymentMethod = 'prepaid'
  } else if (prepaidHours > 0) {
    paymentMethod = 'mixed'
  } else {
    paymentMethod = 'regular'
  }
  
  return {
    prepaidHours,
    regularHours,
    totalHours: hours,
    amount: regularHours * 14000,
    paymentMethod
  }
}

/**
 * 예약 + 선불권 차감 트랜잭션 실행
 */
export async function executeBookingWithPrepaid(
  bookingData: {
    bookingDate: string
    startTime: string
    endTime: string
    space: string
    memberType: string
    household?: string
    name: string
    phone: string
    userId?: string
    prepaidHoursUsed: number
    regularHours: number
    paymentMethod: string
    amount: number
  },
  deductionPlan: DeductionPlan[]
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase.rpc('create_booking_with_prepaid', {
    p_booking_data: bookingData as any,
    p_deduction_plan: deductionPlan as any
  })
  
  if (error) {
    console.error('예약 트랜잭션 오류:', error)
    return { success: false, error: error.message }
  }
  
  if (!data || !data.success) {
    return { success: false, error: data?.error || 'Unknown error' }
  }
  
  return { success: true, bookingId: data.bookingId }
}

/**
 * 예약 취소 + 선불권 복구
 */
export async function cancelBookingWithRestore(
  bookingId: string
): Promise<{ success: boolean; restoredHours?: number; error?: string }> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase.rpc('cancel_booking_restore_prepaid', {
    p_booking_id: bookingId
  })
  
  if (error) {
    console.error('취소 트랜잭션 오류:', error)
    return { success: false, error: error.message }
  }
  
  if (!data || !data.success) {
    return { success: false, error: data?.error || 'Unknown error' }
  }
  
  return { success: true, restoredHours: data.restoredHours }
}
