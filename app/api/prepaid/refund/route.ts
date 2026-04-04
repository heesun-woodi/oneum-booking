/**
 * 선불권 환불 신청
 * 
 * POST /api/prepaid/refund
 * 
 * Body:
 * {
 *   "purchase_id": "uuid",
 *   "user_id": "uuid"  // 로그인한 사용자 ID
 * }
 * 
 * 환불 금액 계산: 결제금액 - (사용회차 × 14,000원)
 * 8회 이상 사용 시 환불 불가
 * 
 * 로그인 필수
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const REGULAR_PRICE_PER_HOUR = 14000 // 정상가: 시간당 14,000원

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()
    const body = await request.json()

    const { purchase_id, user_id } = body

    // 필수 파라미터 검증
    if (!purchase_id || !user_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: '구매 ID와 사용자 ID가 필요합니다.' 
        },
        { status: 400 }
      )
    }

    // 구매 내역 조회 (상품 정보 포함)
    const { data: purchase, error: purchaseError } = await supabase
      .from('prepaid_purchases')
      .select(`
        *,
        product:prepaid_products(*)
      `)
      .eq('id', purchase_id)
      .eq('user_id', user_id)
      .single()

    if (purchaseError || !purchase) {
      return NextResponse.json(
        { 
          success: false, 
          error: '유효하지 않은 구매 내역입니다.' 
        },
        { status: 404 }
      )
    }

    // 이미 환불된 경우
    if (purchase.status === 'refunded') {
      return NextResponse.json(
        { 
          success: false, 
          error: '이미 환불된 선불권입니다.' 
        },
        { status: 400 }
      )
    }

    // 환불 가능 여부 확인 (paid 상태만 환불 가능)
    if (purchase.status !== 'paid') {
      return NextResponse.json(
        { 
          success: false, 
          error: '환불 가능한 상태가 아닙니다.' 
        },
        { status: 400 }
      )
    }

    // 사용 회차 계산
    const hours_used = purchase.total_hours - purchase.remaining_hours

    // 환불 금액 계산
    const total_paid = purchase.product.price
    const used_amount = hours_used * REGULAR_PRICE_PER_HOUR
    const refund_amount = total_paid - used_amount

    // 환불 불가 조건: 8회 이상 사용 (환불 금액이 음수 또는 0)
    if (refund_amount <= 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: '이미 혜택을 충분히 사용하여 환불이 불가능합니다.',
          calculation: {
            total_paid,
            hours_used,
            cost_per_hour: REGULAR_PRICE_PER_HOUR,
            used_amount,
            refund_amount: 0,
            refundable: false,
          }
        },
        { status: 400 }
      )
    }

    // 환불 신청 처리 (관리자 승인 대기)
    const { data: refundedPurchase, error: refundError } = await supabase
      .from('prepaid_purchases')
      .update({
        status: 'refund_requested',
        refund_amount: refund_amount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', purchase_id)
      .select()
      .single()

    if (refundError) {
      console.error('환불 신청 처리 실패:', refundError)
      return NextResponse.json(
        {
          success: false,
          error: '환불 신청 처리에 실패했습니다.'
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      purchase: refundedPurchase,
      calculation: {
        total_paid,
        hours_used,
        cost_per_hour: REGULAR_PRICE_PER_HOUR,
        used_amount,
        refund_amount,
        refundable: true,
      },
      message: `환불 신청이 완료되었습니다. 관리자 승인 후 ${refund_amount.toLocaleString()}원이 환불됩니다.`,
    })

  } catch (error: any) {
    console.error('환불 처리 오류:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      },
      { status: 500 }
    )
  }
}
