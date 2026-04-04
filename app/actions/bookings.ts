'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/sender'

export interface CreateBookingInput {
  bookingDate: string        // YYYY-MM-DD
  times: string[]            // ['14:00', '15:00']
  space: 'nolter' | 'soundroom'
  memberType: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
  userId?: string            // Phase 6.5: 선불권 사용을 위한 user_id
}

export async function createBooking(input: CreateBookingInput) {
  try {
    console.log('🚀 Creating booking:', input)
    
    // ⭐ 당일 예약 차단 검증 (서버 사이드)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const bookingDate = new Date(input.bookingDate)
    bookingDate.setHours(0, 0, 0, 0)
    
    if (bookingDate.getTime() === today.getTime()) {
      console.log(`⛔ 당일 예약 차단: ${input.bookingDate}`)
      return {
        success: false,
        error: '당일 예약은 불가능합니다. 최소 1일 전에 예약해주세요.'
      }
    }
    
    // 과거 날짜 예약 차단
    if (bookingDate.getTime() < today.getTime()) {
      console.log(`⛔ 과거 날짜 예약 차단: ${input.bookingDate}`)
      return {
        success: false,
        error: '과거 날짜는 예약할 수 없습니다.'
      }
    }
    
    // 시간대 파싱
    const startTime = input.times[0]
    // endTime = 마지막 슬롯의 종료 시간 (마지막 시간 + 1시간)
    const lastTime = input.times[input.times.length - 1]
    const lastHour = parseInt(lastTime.split(':')[0])
    const endTime = `${String(lastHour + 1).padStart(2, '0')}:00`
    
    // 전화번호 정규화 (숫자만 저장)
    const normalizedPhone = input.phone.replace(/[^0-9]/g, '')
    
    // Phase 6.5: 선불권 우선 사용 (userId가 있는 경우)
    // 세대 회원도 월 8시간 초과 시 선불권 확인
    if (input.userId) {
      console.log('🎫 선불권 확인 및 사용 시도 (userId:', input.userId, ')')
      
      try {
        // RPC 함수 호출
        const { data: rpcData, error: rpcError } = await supabase
          .rpc('create_booking_with_prepaid', {
            p_user_id: input.userId,
            p_booking_date: input.bookingDate,
            p_start_time: startTime,
            p_end_time: endTime,
            p_space: input.space,
            p_member_type: input.memberType,
            p_household: input.household || null,
            p_name: input.name,
            p_phone: normalizedPhone,
            p_requested_hours: input.times.length
          })
        
        if (rpcError) {
          console.error('❌ RPC error:', rpcError)
          // RPC 실패 시 일반 예약으로 폴백
          throw rpcError
        }
        
        console.log('✅ Booking created with prepaid:', rpcData)
        
        // RPC 결과 파싱
        const result = rpcData[0]
        const data = {
          id: result.booking_id,
          booking_date: input.bookingDate,
          start_time: startTime,
          end_time: endTime,
          space: input.space,
          member_type: input.memberType,
          household: input.household,
          name: input.name,
          phone: normalizedPhone,
          amount: result.amount,
          status: result.booking_status,
          payment_status: result.booking_payment_status,
          prepaid_hours_used: result.prepaid_hours_used,
          regular_hours: result.regular_hours
        }
        
        console.log('🎫 선불권 사용 결과:', {
          prepaid_hours: result.prepaid_hours_used,
          regular_hours: result.regular_hours,
          amount: result.amount,
          payment_status: result.payment_status
        })
        
        // SMS 발송
        await sendBookingNotifications(data, input, normalizedPhone)
        
        // 캘린더 갱신
        revalidatePath('/')
        
        return { success: true, data }
      } catch (rpcError) {
        console.warn('⚠️ RPC 실패, 일반 예약으로 폴백:', rpcError)
        // RPC 실패 시 아래의 일반 예약 로직으로 계속 진행
      }
    }
    
    // 기존 로직: 일반 예약 (회원 무료 또는 비회원 유료)
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
        phone: normalizedPhone,
        user_id: input.userId || null,  // ⭐ 추가
        amount,
        status: input.memberType === 'member' ? 'confirmed' : 'pending',
        payment_status: input.memberType === 'member' ? 'completed' : 'pending',
        prepaid_hours_used: 0,
        regular_hours: input.times.length,
        payment_method: input.memberType === 'member' ? 'free' : 'regular'  // ⭐ 추가
      })
      .select()
      .single()
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw error
    }
    
    console.log('✅ Booking created:', data)
    // SMS 발송
    await sendBookingNotifications(data, input, normalizedPhone)
    
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
    // 해당 월의 마지막 날 계산 (Date(year, month, 0) = 이전 달의 마지막 날)
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    console.log('📅 Fetching bookings:', { year, month, space, startDate, endDate })
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('space', space)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .in('status', ['confirmed', 'pending']) // pending도 표시 (미입금 예약)
    
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

// ===== 전화번호로 예약 조회 =====
export async function getBookingsByPhone(phone: string) {
  try {
    console.log('🔍 Fetching bookings for phone:', phone)
    
    // 전화번호 정규화 (숫자만 추출)
    const normalizedPhone = phone.replace(/[^0-9]/g, '')
    
    // 오늘 날짜 (한국 시간)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('phone', normalizedPhone)
      .in('status', ['confirmed', 'pending'])
      .gte('booking_date', todayStr)
      .order('booking_date', { ascending: true })
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw error
    }
    
    console.log('✅ Bookings found:', data?.length, 'records')
    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('❌ Get bookings by phone error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// ===== 예약 취소 =====
export async function cancelBooking(bookingId: string) {
  try {
    console.log('🗑️ Cancelling booking:', bookingId)
    
    // 예약 존재 여부 확인
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
    
    // 상태 업데이트
    const { error } = await supabase
      .from('bookings')
      .update({ 
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw error
    }
    
    console.log('✅ Booking cancelled')
    
    // ===== 📨 알림 발송 =====
    if (booking.payment_status === 'completed') {
      const dateStr = new Date(booking.booking_date).toLocaleDateString('ko-KR', {
        month: 'long',
        day: 'numeric',
      })
      const timeStr = `${booking.start_time} ~ ${booking.end_time}`
      const spaceStr = booking.space === 'nolter' ? '놀터' : '방음실'

      // 2-3: 예약 취소 알림 (입금 완료자만)
      await sendNotification({
        type: '2-3',
        phone: booking.phone,
        variables: {
          name: booking.name,
          date: dateStr,
          time: timeStr,
          space: spaceStr,
        },
        bookingId: booking.id,
      })

      // 5-3: 재무담당자 환불 안내 (이용일 아닌 경우만)
      const today = new Date().toISOString().split('T')[0]
      if (booking.booking_date !== today && booking.amount > 0) {
        await sendNotification({
          type: '5-3',
          phone: process.env.FINANCE_PHONE || '',
          variables: {
            name: booking.name,
            phone: booking.phone,
            amount: booking.amount.toLocaleString(),
            date: dateStr,
          },
        })
      }
    }
    
    // 캘린더 갱신
    revalidatePath('/')
    
    return { success: true }
  } catch (error: any) {
    console.error('❌ Cancel booking error:', error)
    return { success: false, error: error.message }
  }
}

// ===== 세대별 예약 조회 =====
export async function getBookingsByHousehold(household: string) {
  try {
    console.log('🏠 Fetching bookings by household:', household)
    
    const today = new Date().toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('household', household)
      .eq('status', 'confirmed')
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
    
    if (error) {
      console.error('❌ Supabase error:', error)
      throw error
    }
    
    console.log('✅ Household bookings found:', data?.length, 'records')
    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('❌ Get bookings by household error:', error)
    return { success: false, error: error.message, data: [] }
  }
}

// ===== SMS 발송 헬퍼 함수 =====
async function sendBookingNotifications(
  booking: any,
  input: CreateBookingInput,
  normalizedPhone: string
) {
  const dateStr = new Date(booking.booking_date).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  })
  const timeStr = `${booking.start_time} ~ ${booking.end_time}`
  const spaceStr = booking.space === 'nolter' ? '놀터' : '방음실'

  // Phase 6.5: 선불권 사용 예약
  if (booking.payment_status === 'prepaid') {
    // 전체 선불권 사용 - 임시로 2-1 타입 사용 (TODO: 7-3 타입 추가)
    await sendNotification({
      type: '2-1',
      phone: normalizedPhone,
      variables: {
        name: input.name,
        household: input.household || '',
        date: dateStr,
        time: timeStr,
        space: spaceStr,
      },
      bookingId: booking.id,
    })
  } else if (input.memberType === 'member') {
    // 2-1: 회원 예약 완료
    await sendNotification({
      type: '2-1',
      phone: normalizedPhone,
      variables: {
        name: input.name,
        household: input.household || '',
        date: dateStr,
        time: timeStr,
        space: spaceStr,
      },
      bookingId: booking.id,
    })
  } else {
    // 2-2: 비회원 예약 완료 (입금 안내)
    const deadline = new Date(booking.booking_date)
    deadline.setDate(deadline.getDate() - 1)
    const deadlineStr = deadline.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })

    await sendNotification({
      type: '2-2',
      phone: normalizedPhone,
      variables: {
        name: input.name,
        date: dateStr,
        time: timeStr,
        space: spaceStr,
        amount: booking.amount.toLocaleString(),
        account: process.env.BANK_ACCOUNT || '카카오뱅크 7979-72-56275 (정상은)',
        deadline: deadlineStr,
      },
      bookingId: booking.id,
    })
  }
}
