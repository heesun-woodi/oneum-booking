'use server'

import { createClient } from '@/lib/supabase/server'

export async function getAdminBookings(options: {
  status?: string
  startDate?: string
  endDate?: string
  household?: string
  space?: string
  limit?: number
  offset?: number
} = {}) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false })
    
    if (options.status) {
      query = query.eq('status', options.status)
    }
    
    if (options.startDate) {
      query = query.gte('booking_date', options.startDate)
    }
    
    if (options.endDate) {
      query = query.lte('booking_date', options.endDate)
    }
    
    if (options.household) {
      query = query.eq('household', options.household)
    }
    
    if (options.space) {
      query = query.eq('space', options.space)
    }
    
    if (options.limit) {
      query = query.limit(options.limit)
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
    }
    
    const { data, error, count } = await query
    
    if (error) {
      return { success: false, error: error.message, bookings: [], total: 0 }
    }
    
    return { success: true, bookings: data || [], total: count || 0 }
  } catch (error) {
    console.error('Get admin bookings error:', error)
    return { success: false, error: '조회 중 오류가 발생했습니다.', bookings: [], total: 0 }
  }
}

export async function getTodayBookings() {
  const today = new Date().toISOString().split('T')[0]
  return getAdminBookings({
    startDate: today,
    endDate: today,
    status: 'confirmed'
  })
}

export async function cancelBookingAdmin(bookingId: string, reason?: string) {
  try {
    const supabase = await createClient()

    const { data: booking, error: checkError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (checkError || !booking) {
      return { success: false, error: '예약을 찾을 수 없습니다.' }
    }

    if (booking.status === 'cancelled') {
      return { success: false, error: '이미 취소된 예약입니다.' }
    }

    const isPrepaidBooking = (booking.prepaid_hours_used ?? 0) > 0

    if (isPrepaidBooking) {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('cancel_booking_restore_prepaid', { p_booking_id: bookingId })

      if (rpcError) throw rpcError
      if (!rpcData?.success) {
        return { success: false, error: rpcData?.error || '선불권 복구 중 오류가 발생했습니다' }
      }

      if (reason) {
        await supabase
          .from('bookings')
          .update({ cancellation_reason: reason })
          .eq('id', bookingId)
      }
    } else {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || '관리자 취소',
        })
        .eq('id', bookingId)

      if (error) throw error
    }

    return { success: true }
  } catch (error: any) {
    console.error('❌ Cancel booking admin error:', error)
    return { success: false, error: error.message }
  }
}
