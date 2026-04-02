/**
 * 선불권 상품 목록 조회
 * 
 * GET /api/prepaid/products
 * 
 * 활성화된 선불권 상품 목록을 반환합니다.
 * 인증 불필요 (누구나 조회 가능)
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    // 활성화된 상품만 조회 (display_order 순)
    const { data: products, error } = await supabase
      .from('prepaid_products')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true })

    if (error) {
      console.error('선불권 상품 조회 실패:', error)
      return NextResponse.json(
        { 
          success: false, 
          error: '상품 조회에 실패했습니다.' 
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      products: products || [],
    })

  } catch (error: any) {
    console.error('선불권 상품 조회 오류:', error)
    return NextResponse.json(
      { 
        success: false, 
        error: '서버 오류가 발생했습니다.' 
      },
      { status: 500 }
    )
  }
}
