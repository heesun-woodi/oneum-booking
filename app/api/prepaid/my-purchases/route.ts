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
    const { searchParams } = new URL(request.url)
    const user_id = searchParams.get('user_id')
    const phone = searchParams.get('phone')

    if (!user_id && !phone) {
      return NextResponse.json(
        { success: false, error: '사용자 ID 또는 전화번호가 필요합니다.' },
        { status: 400 }
      )
    }

    const supabase = await createServiceRoleClient()

    // user_id 또는 phone으로 사용자 조회
    let userQuery = supabase.from('users').select('id').eq('status', 'approved')
    if (user_id) {
      userQuery = userQuery.eq('id', user_id)
    } else {
      const normalizedPhone = phone!.replace(/[^0-9]/g, '')
      userQuery = userQuery.eq('phone', normalizedPhone)
    }

    const { data: user, error: userError } = await userQuery.single()

    if (userError || !user) {
      return NextResponse.json(
        { success: false, error: '유효하지 않은 사용자입니다.' },
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
