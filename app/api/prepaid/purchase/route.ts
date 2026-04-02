/**
 * 선불권 구매 신청
 * 
 * POST /api/prepaid/purchase
 * 
 * Body:
 * {
 *   "product_id": "uuid",
 *   "user_id": "uuid"  // 로그인한 사용자 ID
 * }
 * 
 * 로그인 필수
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()

    const { product_id, user_id } = body

    // 필수 파라미터 검증
    if (!product_id || !user_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: '상품 ID와 사용자 ID가 필요합니다.' 
        },
        { status: 400 }
      )
    }

    // 상품 조회
    const { data: product, error: productError } = await supabase
      .from('prepaid_products')
      .select('*')
      .eq('id', product_id)
      .eq('is_active', true)
      .single()

    if (productError || !product) {
      return NextResponse.json(
        { 
          success: false, 
          error: '유효하지 않은 상품입니다.' 
        },
        { status: 404 }
      )
    }

    // 사용자 확인
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, name, phone')
      .eq('id', user_id)
      .eq('status', 'approved')
      .single()

    if (userError || !user) {
      return NextResponse.json(
        { 
          success: false, 
          error: '유효하지 않은 사용자입니다.' 
        },
        { status: 403 }
      )
    }

    // 구매 신청 생성
    const { data: purchase, error: purchaseError } = await supabase
      .from('prepaid_purchases')
      .insert({
        user_id: user_id,
        product_id: product_id,
        total_hours: product.hours,
        remaining_hours: product.hours,
        status: 'pending',
      })
      .select()
      .single()

    if (purchaseError) {
      console.error('선불권 구매 신청 실패:', purchaseError)
      return NextResponse.json(
        { 
          success: false, 
          error: '구매 신청에 실패했습니다.' 
        },
        { status: 500 }
      )
    }

    // TODO: SMS 입금 안내 발송 (Phase 6.7에서 구현)
    // await sendPurchaseNotification(user, product, purchase)

    return NextResponse.json({
      success: true,
      purchase,
      message: '구매 신청이 완료되었습니다. 입금 안내 SMS를 확인해주세요.',
    })

  } catch (error: any) {
    console.error('선불권 구매 신청 오류:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      },
      { status: 500 }
    )
  }
}
