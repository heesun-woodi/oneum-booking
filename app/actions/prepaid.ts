'use server'

/**
 * 선불권 관련 actions
 * Phase 6.5: 프론트엔드 선불권 연동
 */

export interface PrepaidPurchase {
  id: string
  user_id: string
  product_id: string
  total_hours: number
  remaining_hours: number
  purchased_at: string
  paid_at: string | null
  expires_at: string | null
  status: 'pending' | 'paid' | 'refunded'
  refund_amount: number | null
  refunded_at: string | null
  created_at: string
  updated_at: string
  product?: {
    id: string
    name: string
    price: number
    regular_price: number
    hours: number
    validity_months: number
  }
}

/**
 * 사용자의 선불권 구매 내역 조회
 */
export async function getMyPrepaidPurchases(userId: string) {
  try {
    console.log('🎫 선불권 조회:', userId)
    
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/prepaid/my-purchases?user_id=${userId}`,
      {
        method: 'GET',
        cache: 'no-store'
      }
    )
    
    const result = await response.json()
    
    if (!result.success) {
      console.error('❌ 선불권 조회 실패:', result.error)
      throw new Error(result.error)
    }
    
    console.log('✅ 선불권 조회 성공:', result.purchases.length, '건')
    return { success: true, data: result.purchases as PrepaidPurchase[] }
  } catch (error: any) {
    console.error('❌ 선불권 조회 오류:', error)
    return { success: false, error: error.message, data: [] }
  }
}


