'use server'

import { supabase } from '@/lib/supabase'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/sender'
import {
  getAvailablePrepaidPurchases,
  createDeductionPlan,
  executeBookingWithPrepaid,
  getPrepaidSummary,
  cancelBookingWithRestore,
  type DeductionPlan
} from '@/lib/prepaid/booking-utils'

export interface CreateBookingInput {
  bookingDate: string        // YYYY-MM-DD
  times: string[]            // ['14:00', '15:00']
  space: 'nolter' | 'soundroom'
  memberType: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
  userId?: string  // 🆕 Phase 6.5: 선불권 조회용
}

export interface BookingResult {
  success: boolean
  data?: any
  error?: string
  prepaidInfo?: {  // 🆕 Phase 6.5: 선불권 정보
    prepaidHoursUsed: number
    regularHours: number
    remainingPrepaidHours: number
    paymentMethod: string
    amountToPay: number
  }
}

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
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
    const hours = input.times.length
    const startTime = input.times[0]
    const lastTime = input.times[input.times.length - 1]
    const lastHour = parseInt(lastTime.split(':')[0])
    const endTime = `${String(lastHour + 1).padStart(2, '0')}:00`
    
    // 전화번호 정규화 (숫자만 저장)
    const normalizedPhone = input.phone.replace(/[^0-9]/g, '')
    
    // ===== 🆕 Phase 6.5: 선불권 처리 =====
    let prepaidHoursUsed = 0
    let regularHours = hours
    let paymentMethod: string = 'regular'
    let amount = 0
    let deductionPlan: DeductionPlan[] = []
    
    if (input.memberType === 'member') {
      // 세대 회원: 무료 (기존 로직)
      prepaidHoursUsed = 0
      regularHours = 0
      paymentMethod = 'free'
      amount = 0
    } else if (input.userId) {
      // 로그인 사용자: 선불권 확인
      console.log('🎫 Checking prepaid for user:', input.userId)
      const prepaidPurchases = await getAvailablePrepaidPurchases(
        input.userId,
        bookingDate
      )
      
      if (prepaidPurchases.length > 0) {
        const plan = createDeductionPlan(prepaidPurchases, hours)
        deductionPlan = plan.plan
        prepaidHoursUsed = plan.prepaidHours
        regularHours = plan.regularHours
        
        console.log(`📊 Deduction plan: ${prepaidHoursUsed}h prepaid + ${regularHours}h regular`)
        
        if (prepaidHoursUsed === hours) {
          paymentMethod = 'prepaid'
        } else if (prepaidHoursUsed > 0) {
          paymentMethod = 'mixed'
        }
        
        amount = regularHours * 14000
      } else {
        // 선불권 없음
        console.log('❌ No prepaid available')
        amount = hours * 14000
      }
    } else {
      // 비로그인: 일반 결제
      amount = hours * 14000
    }
    
    // ===== 예약 생성 (트랜잭션) =====
    const bookingData = {
      bookingDate: input.bookingDate,
      startTime,
      endTime,
      space: input.space,
      memberType: input.memberType,
      household: input.household || '',
      name: input.name,
      phone: normalizedPhone,
      userId: input.userId || '',
      prepaidHoursUsed,
      regularHours,
      paymentMethod,
      amount
    }
    
    console.log('💾 Executing booking transaction...')
    const result = await executeBookingWithPrepaid(bookingData, deductionPlan)
    
    if (!result.success) {
      console.error('❌ Transaction failed:', result.error)
      return { success: false, error: result.error }
    }
    
    // 예약 데이터 조회
    const { data: booking, error: selectError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', result.bookingId)
      .single()
    
    if (selectError || !booking) {
      console.error('❌ Failed to fetch created booking')
      return { success: false, error: 'Failed to fetch booking' }
    }
    
    console.log('✅ Booking created:', booking)
    
    // ===== 📨 알림 발송 =====
    const dateStr = new Date(booking.booking_date).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })
    const timeStr = `${booking.start_time} ~ ${booking.end_time}`
    const spaceStr = booking.space === 'nolter' ? '놀터' : '방음실'

    if (paymentMethod === 'free') {
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
    } else if (paymentMethod === 'prepaid') {
      // 🆕 선불권으로 완료 (새 알림 타입 필요 시 추가)
      await sendNotification({
        type: '2-1',  // 임시로 2-1 사용 (선불권 버전 추가 가능)
        phone: normalizedPhone,
        variables: {
          name: input.name,
          household: '',
          date: dateStr,
          time: timeStr,
          space: spaceStr,
        },
        bookingId: booking.id,
      })
    } else if (paymentMethod === 'mixed' || paymentMethod === 'regular') {
      // 2-2: 입금 안내 (혼합 또는 일반)
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
          amount: amount.toLocaleString(),
          account: process.env.BANK_ACCOUNT || '카카오뱅크 7979-72-56275 (정상은)',
          deadline: deadlineStr,
        },
        bookingId: booking.id,
      })
    }
    
    // ===== 선불권 정보 포함하여 반환 =====
    let remainingPrepaidHours = 0
    if (input.userId) {
      const summary = await getPrepaidSummary(input.userId)
      remainingPrepaidHours = summary.totalRemainingHours
    }
    
    // 캘린더 갱신
    revalidatePath('/')
    
    return {
      success: true,
      data: booking,
      prepaidInfo: {
        prepaidHoursUsed,
        regularHours,
        remainingPrepaidHours,
        paymentMethod,
        amountToPay: amount
      }
    }
  } catch (error: any) {
    console.error('❌ Create booking error:', error)
    return { success: false, error: error.message }
  }
}

export async function getBookings(year: number, month: number, space: string) {
  try {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    console.log('📅 Fetching bookings:', { year, month, space, startDate, endDate })
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('space', space)
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
      .in('status', ['confirmed', 'pending'])
    
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

export async function getBookingsByPhone(phone: string) {
  try {
    console.log('🔍 Fetching bookings for phone:', phone)
    
    const normalizedPhone = phone.replace(/[^0-9]/g, '')
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
    
    // 🆕 Phase 6.5: 선불권 복구 + 취소 트랜잭션
    const result = await cancelBookingWithRestore(bookingId)
    
    if (!result.success) {
      console.error('❌ Cancel transaction failed:', result.error)
      return { success: false, error: result.error }
    }
    
    // 복구된 시간이 있으면 로그
    if (result.restoredHours && result.restoredHours > 0) {
      console.log(`✅ 선불권 ${result.restoredHours}시간 복구됨`)
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

      // 2-3: 예약 취소 알림
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

      // 5-3: 재무담당자 환불 안내
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
