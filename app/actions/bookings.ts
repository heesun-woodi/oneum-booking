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
    // endTime = 마지막 슬롯의 종료 시간 (마지막 슬롯 + 30분)
    const lastTime = input.times[input.times.length - 1]
    const [lastH, lastM] = lastTime.split(':').map(Number)
    const endMinutes = lastH * 60 + lastM + 30
    const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`
    
    // 전화번호 정규화 (숫자만 저장)
    const normalizedPhone = input.phone.replace(/[^0-9]/g, '')
    
    // Phase 7: 온음 세대 회원 + 놀터 전용 정책 (월 3회 무료, 이후 10,000원/건)
    if (input.memberType === 'member' && input.space === 'nolter') {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

      const { count, error: countError } = await supabase
        .from('bookings')
        .select('*', { count: 'exact', head: true })
        .eq('household', input.household || '')
        .eq('space', 'nolter')
        .neq('status', 'cancelled')
        .gte('booking_date', monthStart)
        .lt('booking_date', nextMonthStr)

      if (countError) throw countError

      const currentCount = count ?? 0
      const isFree = currentCount < 3
      const amount = isFree ? 0 : 10000
      const paymentMethod = isFree ? 'free' : 'nolter_paid'
      const status = isFree ? 'confirmed' : 'pending'
      const paymentStatus = isFree ? 'completed' : 'pending'

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
          user_id: input.userId || null,
          amount,
          status,
          payment_status: paymentStatus,
          prepaid_hours_used: 0,
          regular_hours: input.times.length,
          payment_method: paymentMethod,
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Supabase error (nolter):', error)
        throw error
      }

      console.log(`✅ 놀터 회원 예약: ${isFree ? `무료 (${currentCount + 1}/3회)` : `유료 10,000원 (${currentCount + 1}회차)`}`)
      await sendBookingNotifications(data, input, normalizedPhone)
      revalidatePath('/')
      return { success: true, data }
    }

    // Phase 6.5: 선불권 우선 사용 (userId가 있는 경우, 비회원 또는 방음실 회원)
    if (input.userId) {
      console.log('🎫 선불권 확인 및 사용 시도 (userId:', input.userId, ')')

      try {
        // 1. 사용 가능한 선불권 조회 (유효기간 임박 순)
        const now = new Date().toISOString()
        const { data: purchases, error: purchasesError } = await supabase
          .from('prepaid_purchases')
          .select('id, remaining_hours, expires_at')
          .eq('user_id', input.userId)
          .eq('status', 'paid')
          .gt('remaining_hours', 0)
          .gt('expires_at', now)
          .order('expires_at', { ascending: true })

        if (purchasesError) throw purchasesError

        // 2. 차감 계획 계산
        const requestedHours = input.times.length
        let remainingToFill = requestedHours
        let prepaidHoursUsed = 0
        const deductionPlan: Array<{ purchaseId: string; hoursToDeduct: number }> = []

        for (const purchase of (purchases || [])) {
          if (remainingToFill === 0) break
          const hoursToUse = Math.min(purchase.remaining_hours, remainingToFill)
          prepaidHoursUsed += hoursToUse
          remainingToFill -= hoursToUse
          deductionPlan.push({ purchaseId: purchase.id, hoursToDeduct: hoursToUse })
        }

        // 선불권 사용 없으면 일반 예약으로
        if (deductionPlan.length === 0) {
          console.log('ℹ️ 사용 가능한 선불권 없음, 일반 예약으로 진행')
        } else {
          const regularHours = remainingToFill
          const amount = regularHours * 7000
          const paymentMethod = regularHours === 0 ? 'prepaid' : 'mixed'

          // 3. RPC 호출 (올바른 JSONB 형식)
          const { data: rpcData, error: rpcError } = await supabase
            .rpc('create_booking_with_prepaid', {
              p_booking_data: {
                bookingDate: input.bookingDate,
                startTime: startTime,
                endTime: endTime,
                space: input.space,
                memberType: input.memberType,
                household: input.household || '',
                name: input.name,
                phone: normalizedPhone,
                userId: input.userId,
                prepaidHoursUsed: prepaidHoursUsed,
                regularHours: regularHours,
                paymentMethod: paymentMethod,
                amount: amount,
              },
              p_deduction_plan: deductionPlan,
            })

          if (rpcError) {
            console.error('❌ RPC error:', rpcError)
            throw rpcError
          }

          if (!rpcData?.success) {
            throw new Error(rpcData?.error || 'RPC returned failure')
          }

          console.log('✅ 선불권 예약 완료:', rpcData)

          const data = {
            id: rpcData.bookingId,
            booking_date: input.bookingDate,
            start_time: startTime,
            end_time: endTime,
            space: input.space,
            member_type: input.memberType,
            household: input.household,
            name: input.name,
            phone: normalizedPhone,
            amount: amount,
            status: paymentMethod === 'prepaid' ? 'confirmed' : 'pending',
            payment_status: paymentMethod === 'prepaid' ? 'completed' : 'pending',
            prepaid_hours_used: prepaidHoursUsed,
            regular_hours: regularHours,
          }

          console.log('🎫 선불권 사용 결과:', {
            prepaid_hours: prepaidHoursUsed,
            regular_hours: regularHours,
            amount,
            payment_method: paymentMethod,
          })

          await sendBookingNotifications(data, input, normalizedPhone)
          revalidatePath('/')

          return { success: true, data }
        }
      } catch (rpcError) {
        console.warn('⚠️ RPC 실패, 일반 예약으로 폴백:', rpcError)
      }
    }
    
    // 기존 로직: 일반 예약 (회원 무료 또는 비회원 유료)
    const amount = input.memberType === 'member' ? 0 : input.times.length * 7000
    
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
      .order('booking_date', { ascending: false })
    
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

    const isPrepaidBooking = (booking.prepaid_hours_used ?? 0) > 0

    if (isPrepaidBooking) {
      // 선불권 사용 예약: RPC로 원자적 취소 + 선불권 복구
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('cancel_booking_restore_prepaid', { p_booking_id: bookingId })

      if (rpcError) {
        console.error('❌ RPC error:', rpcError)
        throw rpcError
      }
      if (!rpcData?.success) {
        return { success: false, error: rpcData?.error || '선불권 복구 중 오류가 발생했습니다' }
      }
      console.log('✅ Booking cancelled + prepaid restored:', rpcData.restoredHours, 'hours')
    } else {
      // 일반 예약 취소 (기존 로직)
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
    }

    // ===== 📨 알림 발송 =====
    const dateStr = new Date(booking.booking_date).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })
    const timeStr = `${booking.start_time} ~ ${booking.end_time}`
    const spaceStr = booking.space === 'nolter' ? '놀터' : '방음실'

    if (booking.payment_status === 'completed' || isPrepaidBooking) {
      // 2-3: 예약 취소 알림 (입금 완료 또는 선불권 사용자)
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

      // 5-3: 재무담당자 환불 안내 (현금 입금 완료자이고 이용일이 아닌 경우만)
      const today = new Date().toISOString().split('T')[0]
      if (booking.payment_status === 'completed' && booking.booking_date !== today && booking.amount > 0) {
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

export async function getPastBookingsByHousehold(household: string) {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('household', household)
      .lt('booking_date', today)
      .in('status', ['confirmed', 'completed', 'cancelled'])
      .order('booking_date', { ascending: false })
      .limit(30)

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
  }
}

// ===== userId 기반 예약 조회 (비세대원용) =====
export async function getBookingsByUserId(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .in('status', ['confirmed', 'pending'])
      .gte('booking_date', today)
      .order('booking_date', { ascending: true })
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
  }
}

export async function getPastBookingsByUserId(userId: string) {
  try {
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', userId)
      .lt('booking_date', today)
      .in('status', ['confirmed', 'completed', 'cancelled'])
      .order('booking_date', { ascending: false })
      .limit(30)
    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
  }
}

// ===== 세대별 이번 달 놀터 예약 건수 조회 (UI용) =====
export async function getMemberNolterCount(household: string): Promise<{ success: boolean; count: number; error?: string }> {
  try {
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const nextMonthStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`

    const { count, error } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('household', household)
      .eq('space', 'nolter')
      .neq('status', 'cancelled')
      .gte('booking_date', monthStart)
      .lt('booking_date', nextMonthStr)

    if (error) throw error
    return { success: true, count: count ?? 0 }
  } catch (error: any) {
    return { success: false, count: 0, error: error.message }
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
  } else if (booking.payment_method === 'nolter_paid') {
    // Phase 7: 놀터 회원 유료 예약 (4회차~) - 입금 안내
    const deadline = new Date(booking.booking_date)
    deadline.setDate(deadline.getDate() - 1)
    const deadlineStr = deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
    await sendNotification({
      type: '2-2',
      phone: normalizedPhone,
      variables: {
        name: input.name,
        date: dateStr,
        time: timeStr,
        space: spaceStr,
        amount: '10,000',
        account: process.env.BANK_ACCOUNT || '카카오뱅크 7979-72-56275 (정상은)',
        deadline: deadlineStr,
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
    // 2-2: 비회원/일반회원 예약 완료 (입금 안내)
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

    // 5-4: 재무담당자 즉시 알림
    if (booking.amount > 0) {
      await sendNotification({
        type: '5-4',
        phone: process.env.FINANCE_PHONE || '',
        variables: {
          name: input.name,
          phone: input.phone,
          date: dateStr,
          time: timeStr,
          space: spaceStr,
          amount: booking.amount.toLocaleString(),
          adminUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/admin/bookings`,
        },
        bookingId: booking.id,
      })
    }
  }
}
