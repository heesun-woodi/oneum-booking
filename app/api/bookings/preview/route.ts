import { NextRequest, NextResponse } from 'next/server'
import { calculateBookingCost, getAvailablePrepaidPurchases, createDeductionPlan } from '@/lib/prepaid/booking-utils'

export const dynamic = 'force-dynamic'

/**
 * POST /api/bookings/preview
 * 예약 비용 미리보기 API
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, hours, bookingDate } = await request.json()
    
    if (!hours || !bookingDate) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터 누락: hours, bookingDate' },
        { status: 400 }
      )
    }
    
    const date = new Date(bookingDate)
    const cost = await calculateBookingCost(userId, hours, date, false)
    
    // 상세 정보
    let prepaidDetail: any[] = []
    if (userId) {
      const purchases = await getAvailablePrepaidPurchases(userId, date)
      const { plan } = createDeductionPlan(purchases, hours)
      prepaidDetail = plan.map(p => {
        const purchase = purchases.find(pur => pur.id === p.purchaseId)
        return {
          purchaseId: p.purchaseId,
          hoursToUse: p.hoursToDeduct,
          expiresAt: purchase?.expires_at
        }
      })
    }
    
    return NextResponse.json({
      success: true,
      cost,
      prepaidDetail
    })
  } catch (error: any) {
    console.error('❌ Preview API error:', error)
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
