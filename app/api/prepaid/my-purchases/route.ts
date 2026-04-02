/**
 * 내 선불권 구매 내역 조회
 * 
 * GET /api/prepaid/my-purchases?user_id=uuid
 * 
 * 로그인 필수
 * expires_at DESC 정렬
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createServiceRoleClient()
    const { searchParams } = new URL(request.url)
    const user_id = searchParams.get('user_id')

    // 필수 파라미터 검증
    if (!user_id) {
      return NextResponse.json(
        { 
          success: false, 
          error: '사용자 ID가 필요합니다.' 
        },
        { status: 400 }
      )
    }

    // 사용자 확인
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id')
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

    // 구매 내역 조회 (상품 정보 포함, expires_at DESC 정렬)
    const { data: purchases, error: purchasesError } = await supabase
      .from('prepaid_purchases')
      .select(`
        *,
        product:prepaid_products(*)
      `)
      .eq('user_id', user_id)
      .order('expires_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })

    if (purchasesError) {
      console.error('구매 내역 조회 실패:', purchasesError)
      return NextResponse.json(
        { 
          success: false, 
          error: '구매 내역 조회에 실패했습니다.' 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      purchases: purchases || [],
    })

  } catch (error: any) {
    console.error('구매 내역 조회 오류:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      },
      { status: 500 }
    )
  }
}
