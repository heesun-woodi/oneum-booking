'use server'

import { supabase } from '@/lib/supabase'
import { sendNotification } from '@/lib/notifications/sender'

/**
 * 입금 확인 처리
 */
export async function confirmPayment(bookingId: string): Promise<{
  success: boolean
  error?: string
}> {
  try {
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
 * 비회원 미입금 예약 목록 조회
 */
export async function getPendingPayments(options?: {
  startDate?: string
  endDate?: string
  limit?: number
}) {
  try {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('member_type', 'non-member')
      .eq('payment_status', 'pending')
      .eq('status', 'pending')
      .order('booking_date', { ascending: true })

    if (options?.startDate) {
      query = query.gte('booking_date', options.startDate)
    }
    if (options?.endDate) {
      query = query.lte('booking_date', options.endDate)
    }
    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data: bookings, error } = await query

    if (error) {
      return { success: false, error: error.message, bookings: [] }
    }

    return { success: true, bookings: bookings || [] }
  } catch (error: any) {
    console.error('미입금 예약 조회 실패:', error)
    return { success: false, error: error.message, bookings: [] }
  }
}

/**
 * 비회원 입금완료 예약 목록 조회
 */
export async function getCompletedPayments(options?: {
  startDate?: string
  endDate?: string
  limit?: number
}) {
  try {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('member_type', 'non-member')
      .eq('payment_status', 'completed')
      .neq('status', 'cancelled')
      .order('booking_date', { ascending: true })

    if (options?.startDate) {
      query = query.gte('booking_date', options.startDate)
    }
    if (options?.endDate) {
      query = query.lte('booking_date', options.endDate)
    }
    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data: bookings, error } = await query

    if (error) {
      return { success: false, error: error.message, bookings: [] }
    }

    return { success: true, bookings: bookings || [] }
  } catch (error: any) {
    console.error('입금완료 예약 조회 실패:', error)
    return { success: false, error: error.message, bookings: [] }
  }
}

/**
 * 전체 예약 목록 조회 (관리자용)
 */
export async function getAllBookingsForPayment(options?: {
  startDate?: string
  endDate?: string
}) {
  try {
    let query = supabase
      .from('bookings')
      .select('*')
      .eq('member_type', 'non-member')
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
