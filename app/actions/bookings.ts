'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'

export interface CreateBookingInput {
  bookingDate: string        // YYYY-MM-DD
  times: string[]            // ['14:00', '15:00']
  space: 'nolter' | 'soundroom'
  memberType: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
}

export async function createBooking(input: CreateBookingInput) {
  try {
    console.log('🚀 Creating booking:', input)
    
    // 시간대 파싱
    const startTime = input.times[0]
    const endTime = input.times[input.times.length - 1]
    
    // 금액 계산 (비회원: 14,000원/시간)
    const amount = input.memberType === 'member' ? 0 : input.times.length * 14000
    
    // 예약 생성
    const { data, error } = await supabase
      .from('bookings')
      .insert({
        booking_date: input.bookingDate,
        start_time: startTime,
        end_time: endTime,
        space: input.space,
        member_type: input.memberType,
        household: input.household,
        name: input.name,
        phone: input.phone,
        amount,
        status: 'confirmed'  // 일단 바로 confirmed로 저장
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw error
    }
    
    console.log('✅ Booking created:', data)
    
    // 캘린더 갱신
    revalidatePath('/')
    
    return { success: true, data }
  } catch (error: any) {
    console.error('❌ Create booking error:', error)
    return { success: false, error: error.message }
  }
}

export async function getBookings(year: number, month: number, space: string) {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const endDate = `${year}-${String(month).padStart(2, '0')}-31`
    
    console.log('📅 Fetching bookings:', { year, month, space, startDate, endDate })
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('space', space)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .eq('status', 'confirmed')
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw error
    }
    
    console.log('✅ Bookings fetched:', data?.length, 'records')
    
    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('❌ Get bookings error:', error)
    return { success: false, error: error.message, data: [] }
  }
}
