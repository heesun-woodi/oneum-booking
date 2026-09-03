'use server'

import { createServiceRoleClient } from '@/lib/supabase/server'
import { assertAdmin } from '@/lib/admin-guard'
import { sendNotification } from '@/lib/notifications/sender'

/**
 * 입금 확인 처리
 */
export async function confirmPayment(bookingId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
    const auth = await assertAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const supabase = await createServiceRoleClient()

    // 1. 예약 정보 조회
    const { data: booking, error: fetchError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (fetchError || !booking) {
      return { success: false, error: '예약을 찾을 수 없습니다.' }
    }

    // 2. 입금 상태 업데이트
    const { error: updateError } = await supabase
      .from('bookings')
      .update({
        payment_status: 'completed',
        payment_confirmed_at: new Date().toISOString(),
        status: 'confirmed',
      })
      .eq('id', bookingId)

    if (updateError) {
      return { success: false, error: '입금 확인 업데이트 실패' }
    }

    // 3. 입금 확인 알림 발송 (3-1)
    await sendNotification({
      type: '3-1',
      phone: booking.phone,
      variables: {
        name: booking.name,
        date: new Date(booking.booking_date).toLocaleDateString('ko-KR', {
          month: 'long',
          day: 'numeric',
        }),
        time: `${booking.start_time} ~ ${booking.end_time}`,
        space: booking.space === 'nolter' ? '놀터' : '방음실',
      },
      bookingId: booking.id,
    })

    return { success: true }
  } catch (error: any) {
    console.error('입금 확인 처리 실패:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 전체 예약 목록 조회 (관리자용)
 *
 * 입금 확인이 필요한 예약을 모두 포함한다.
 * 세대원도 무료 시간(놀터 월 20시간)을 초과하면 현금 입금이 필요하고, 그 예약은
 * member_type='member' + payment_method='regular'|'mixed'이라 결제 방식만으로는
 * 무료 예약과 구분되지 않는다. 그래서 '받을 돈이 남았는가'(amount > 0)로 판정한다.
 * 이 조건은 자동취소·입금리마인더 크론(lib/cron/jobs.ts)의 필터와 정확히 일치하며,
 * 구 정책의 nolter_paid(10,000원/건) 예약도 amount=10000이라 그대로 포함된다.
 */
export async function getAllBookingsForPayment(options?: {
  startDate?: string
  endDate?: string
}) {
  try {
    const auth = await assertAdmin()
    if (!auth.ok) return { success: false, error: auth.error, bookings: [] }

    const supabase = await createServiceRoleClient()

    let query = supabase
      .from('bookings')
      .select('*')
      .or('member_type.eq.non-member,amount.gt.0')
      .neq('status', 'cancelled')
      .order('booking_date', { ascending: true })

    if (options?.startDate) {
      query = query.gte('booking_date', options.startDate)
    }
    if (options?.endDate) {
      query = query.lte('booking_date', options.endDate)
    }

    const { data: bookings, error } = await query

    if (error) {
      return { success: false, error: error.message, bookings: [] }
    }

    return { success: true, bookings: bookings || [] }
  } catch (error: any) {
    console.error('전체 예약 조회 실패:', error)
    return { success: false, error: error.message, bookings: [] }
  }
}
