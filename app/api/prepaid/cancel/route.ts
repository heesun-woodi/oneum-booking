/**
 * 선불권 신청 취소 (입금 전 pending 상태만 가능)
 *
 * POST /api/prepaid/cancel
 * Body: { purchase_id: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { purchase_id } = await request.json()

    if (!purchase_id) {
      return NextResponse.json({ success: false, error: '구매 ID가 필요합니다.' }, { status: 400 })
    }

    const supabase = await createServiceRoleClient()

    // pending 상태인지 확인
    const { data: purchase, error: fetchError } = await supabase
      .from('prepaid_purchases')
      .select('id, status')
      .eq('id', purchase_id)
      .single()

    if (fetchError || !purchase) {
      return NextResponse.json({ success: false, error: '구매 내역을 찾을 수 없습니다.' }, { status: 404 })
    }

    if (purchase.status !== 'pending') {
      return NextResponse.json({ success: false, error: '입금 대기 상태인 경우에만 취소 가능합니다.' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('prepaid_purchases')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', purchase_id)

    if (updateError) {
      return NextResponse.json({ success: false, error: '취소 처리에 실패했습니다.' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('선불권 취소 오류:', error)
    return NextResponse.json({ success: false, error: '서버 오류가 발생했습니다.' }, { status: 500 })
  }
}
