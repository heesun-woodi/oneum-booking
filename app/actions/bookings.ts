'use server'

import { supabase } from '@/lib/supabase'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/sender'
import {
  BookingCharge,
  LEGACY_NOLTER_FREE_COUNT_PER_MONTH,
  PolicyVersion,
  PrepaidLike,
  RESIDENT_NOLTER_FREE_HOURS_PER_MONTH,
  computeBookingCharge,
  describeCharge,
  freeHoursAllowance,
  monthRangeOf,
  resolvePolicyVersion,
  resolveUserKind,
  round1,
  slotsToHours,
  usesPrepaidHours,
} from '@/lib/booking-policy'

export interface CreateBookingInput {
  bookingDate: string        // YYYY-MM-DD
  times: string[]            // ['14:00', '15:00']
  space: 'nolter' | 'soundroom'
  memberType: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
  userId?: string            // Phase 6.5: 선불권 사용을 위한 user_id
  consentGiven?: boolean     // 개인정보 수집·이용 동의 (비회원 필수)
  isLoggedIn?: boolean       // 예약 사용자 상태 추적용
  isResident?: boolean       // 세대 입주민 여부
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

    // 비회원 개인정보 수집 동의 확인
    if (input.memberType === 'non-member' && !input.consentGiven) {
      return { success: false, error: '개인정보 수집·이용에 동의해 주세요.' }
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

    // ===== 1. 사용자 종류 확정 =====
    // input.isResident / input.household 는 localStorage 세션에서 오는 값이다.
    // 무료 시간이 걸린 판정이므로 DB에 저장된 값으로 다시 확인한다.
    const serviceSupabase = await createServiceRoleClient()

    let isResident = false
    let household: string | null = null

    if (input.userId) {
      const { data: user, error: userError } = await serviceSupabase
        .from('users')
        .select('id, is_resident, household')
        .eq('id', input.userId)
        .maybeSingle()

      if (userError) throw userError
      if (!user) {
        return { success: false, error: '사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요.' }
      }

      isResident = !!user.is_resident
      household = (user.household ?? '').trim() || null
    }

    const userKind = resolveUserKind({ userId: input.userId, isResident, household })
    // member_type='member' 는 이 시스템에서 '온음 세대원'을 뜻한다 (로그인 회원 일반이 아니다).
    const memberType: 'member' | 'non-member' = userKind === 'resident' ? 'member' : 'non-member'
    const requestedHours = slotsToHours(input.times.length)
    // 정책은 신청 시점이 아니라 '사용일' 기준으로 갈린다 (v2 = 2026-08-01 사용분부터).
    const policyVersion = resolvePolicyVersion(input.bookingDate)

    console.log('👤 예약 사용자 타입 해석', {
      userId: input.userId,
      isLoggedIn: input.isLoggedIn,
      isResident,
      household,
      space: input.space,
      requestedHours,
      resolvedUserKind: userKind,
      policyVersion,
    })

    // ===== 2. 세대 무료 사용량 조회 (놀터 + 세대원일 때만) =====
    // 한도는 신청 시점이 아니라 '사용일(booking_date)이 속한 달' 기준으로 판정한다.
    let freeHoursUsedThisMonth = 0
    let legacyNolterBookingCount = 0
    if (userKind === 'resident' && input.space === 'nolter' && household) {
      if (policyVersion === 'v2') {
        const { monthStart } = monthRangeOf(input.bookingDate)
        const { data: usedData, error: usedError } = await serviceSupabase.rpc(
          'get_household_free_hours',
          { p_household: household, p_month: monthStart }
        )
        if (usedError) throw usedError
        freeHoursUsedThisMonth = round1(Number(usedData ?? 0))
      } else {
        legacyNolterBookingCount = await countHouseholdNolterBookings(
          serviceSupabase,
          household,
          input.bookingDate
        )
      }
    }

    // ===== 3. 선불권 조회 =====
    // 무료로 전부 커버되면 조회조차 하지 않는다.
    // (세대원이 방음실을 예약할 때 선불권이 소진되던 문제를 막는다)
    // v1의 세대원 놀터 예약은 무료 아니면 정액 10,000원이라 선불권이 개입하지 않는다.
    const allowance = freeHoursAllowance(userKind, input.space)
    const freeHoursLeft =
      allowance === Infinity ? Infinity : Math.max(0, round1(allowance - freeHoursUsedThisMonth))
    const canUsePrepaid = usesPrepaidHours(policyVersion, userKind, input.space)

    let prepaidPurchases: PrepaidLike[] = []
    if (input.userId && canUsePrepaid && requestedHours > freeHoursLeft) {
      const { data: purchases, error: purchasesError } = await serviceSupabase
        .from('prepaid_purchases')
        .select('id, remaining_hours, expires_at, status')
        .eq('user_id', input.userId)
        .eq('status', 'paid')
        .gt('remaining_hours', 0)
        .gt('expires_at', new Date().toISOString())
        .order('expires_at', { ascending: true })

      if (purchasesError) throw purchasesError
      prepaidPurchases = (purchases ?? []) as PrepaidLike[]

      console.log('🎫 사용 가능한 선불권', {
        userId: input.userId,
        purchaseCount: prepaidPurchases.length,
      })
    }

    // ===== 4. 과금 계산 (무료 → 선불권 → 현금) =====
    let charge = computeBookingCharge({
      userKind,
      space: input.space,
      bookingDate: input.bookingDate,
      requestedHours,
      freeHoursUsedThisMonth,
      legacyNolterBookingCount,
      prepaidPurchases,
    })

    console.log('💰 과금 계산 결과', { ...charge, breakdown: describeCharge(charge) })

    // ===== 5. 예약 생성 (RPC 단일 경로) =====
    let rpcResult = await createBookingViaRpc({
      serviceSupabase,
      input,
      charge,
      memberType,
      household,
      startTime,
      endTime,
      normalizedPhone,
    })

    if (!rpcResult?.success && rpcResult?.code === 'FREE_HOURS_EXCEEDED') {
      // 같은 세대의 동시 예약으로 무료 시간이 방금 줄었다.
      // 서버가 알려준 실측값으로 재계산해 딱 한 번만 재시도한다.
      console.warn('⚠️ 무료 시간 경합 감지, 재계산 후 1회 재시도', rpcResult)
      charge = computeBookingCharge({
        userKind,
        space: input.space,
        bookingDate: input.bookingDate,
        requestedHours,
        freeHoursUsedThisMonth: round1(Number(rpcResult.freeHoursUsed ?? 0)),
        legacyNolterBookingCount,
        prepaidPurchases,
      })
      rpcResult = await createBookingViaRpc({
        serviceSupabase,
        input,
        charge,
        memberType,
        household,
        startTime,
        endTime,
        normalizedPhone,
      })
    }

    if (!rpcResult?.success) {
      console.error('❌ 예약 생성 실패:', rpcResult)
      return {
        success: false,
        error:
          rpcResult?.code === 'FREE_HOURS_EXCEEDED'
            ? '세대 무료 시간이 방금 소진되었습니다. 새로고침 후 다시 시도해주세요.'
            : rpcResult?.error || '예약 처리 중 오류가 발생했습니다.',
      }
    }

    // ===== 6. 생성된 예약 조회 + 알림 =====
    const { data, error: fetchError } = await serviceSupabase
      .from('bookings')
      .select('*')
      .eq('id', rpcResult.bookingId)
      .single()

    if (fetchError) throw fetchError

    console.log('✅ Booking created:', data)

    await sendBookingNotifications(data, input, normalizedPhone, charge)

    // 캘린더 갱신
    revalidatePath('/')

    return { success: true, data }
  } catch (error: any) {
    console.error('❌ Create booking error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * [v1 전용] 세대의 해당 월 놀터 예약 '건수' (취소 제외).
 *
 * 종전 규정은 이용 시간이 아니라 예약 건수로 무료 3회를 판정했다.
 * 2026-08-01 이후 사용분에는 쓰이지 않는다.
 */
async function countHouseholdNolterBookings(
  serviceSupabase: any,
  household: string,
  bookingDate: string
): Promise<number> {
  const { monthStart, nextMonthStart } = monthRangeOf(bookingDate)

  const { count, error } = await serviceSupabase
    .from('bookings')
    .select('*', { count: 'exact', head: true })
    .eq('household', household)
    .eq('space', 'nolter')
    .neq('status', 'cancelled')
    .gte('booking_date', monthStart)
    .lt('booking_date', nextMonthStart)

  if (error) throw error
  return count ?? 0
}

interface CreateBookingRpcArgs {
  serviceSupabase: any
  input: CreateBookingInput
  charge: BookingCharge
  memberType: 'member' | 'non-member'
  household: string | null
  startTime: string
  endTime: string
  normalizedPhone: string
}

/**
 * 모든 예약이 지나가는 단일 생성 경로.
 *
 * RPC 안에서 무료 한도 검증 → 예약 INSERT → 선불권 차감이 한 트랜잭션으로 처리된다.
 * status / payment_status 는 RPC가 amount > 0 으로 판정한다.
 */
async function createBookingViaRpc({
  serviceSupabase,
  input,
  charge,
  memberType,
  household,
  startTime,
  endTime,
  normalizedPhone,
}: CreateBookingRpcArgs) {
  const { data, error } = await serviceSupabase.rpc('create_booking_with_prepaid', {
    p_booking_data: {
      bookingDate: input.bookingDate,
      startTime,
      endTime,
      space: input.space,
      memberType,
      household: household ?? '',
      name: input.name,
      phone: normalizedPhone,
      userId: input.userId || '',
      // 방음실 무제한 무료와 v1(건수제)은 20시간 원장을 소진하지 않으므로 0이 들어간다.
      freeHoursUsed: charge.freeHoursUsedLedger,
      freeHoursLimit: RESIDENT_NOLTER_FREE_HOURS_PER_MONTH,
      prepaidHoursUsed: charge.prepaidHours,
      regularHours: charge.regularHours,
      paymentMethod: charge.paymentMethod,
      amount: charge.amount,
      piiConsentGiven: memberType === 'non-member',
    },
    p_deduction_plan: charge.deductionPlan,
  })

  if (error) throw error
  return data as {
    success: boolean
    bookingId?: string
    code?: string
    error?: string
    freeHoursUsed?: number
    freeHoursLimit?: number
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
          recipientName: '재무담당자',
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

// ===== 세대별 이번 달 놀터 무료 한도 현황 조회 (UI용) =====
export interface HouseholdNolterQuota {
  success: boolean
  /** 이 달에 적용되는 정책 (시행일이 월 경계라 한 달은 통째로 v1이거나 v2다) */
  policyVersion: PolicyVersion
  /** [v2] 시간 기준 */
  usedHours: number
  limitHours: number
  remainingHours: number
  /** [v1] 건수 기준 */
  usedCount: number
  limitCount: number
  remainingCount: number
  error?: string
}

/**
 * 예약 모달·마이페이지 배지용. 해당 월에 맞는 정책 기준으로 사용 현황을 돌려준다.
 *
 * v2는 예약 판정과 같은 SQL(get_household_free_hours)을 읽으므로
 * 배지와 실제 과금이 어긋나지 않는다.
 *
 * @param targetMonth 'YYYY-MM'. 예약하려는 사용일이 속한 달을 넘긴다. 미지정 시 현재 월.
 */
export async function getHouseholdNolterQuota(
  household: string,
  targetMonth?: string
): Promise<HouseholdNolterQuota> {
  const base = targetMonth ?? new Date().toISOString().substring(0, 7)
  const { monthStart, nextMonthStart } = monthRangeOf(base)
  const policyVersion = resolvePolicyVersion(monthStart)

  const limitHours = policyVersion === 'v2' ? RESIDENT_NOLTER_FREE_HOURS_PER_MONTH : 0
  const limitCount = policyVersion === 'v1' ? LEGACY_NOLTER_FREE_COUNT_PER_MONTH : 0
  const empty: HouseholdNolterQuota = {
    success: true,
    policyVersion,
    usedHours: 0,
    limitHours,
    remainingHours: limitHours,
    usedCount: 0,
    limitCount,
    remainingCount: limitCount,
  }

  try {
    const normalized = (household ?? '').trim()
    if (!normalized) {
      // 세대 번호가 없으면 무료 한도를 집계할 키가 없다.
      return { ...empty, limitHours: 0, remainingHours: 0, limitCount: 0, remainingCount: 0 }
    }

    if (policyVersion === 'v2') {
      const { data, error } = await supabase.rpc('get_household_free_hours', {
        p_household: normalized,
        p_month: monthStart,
      })
      if (error) throw error

      const usedHours = round1(Number(data ?? 0))
      return {
        ...empty,
        usedHours,
        remainingHours: round1(Math.max(0, limitHours - usedHours)),
      }
    }

    // v1: 건수 기준
    const { count, error } = await supabase
      .from('bookings')
      .select('*', { count: 'exact', head: true })
      .eq('household', normalized)
      .eq('space', 'nolter')
      .neq('status', 'cancelled')
      .gte('booking_date', monthStart)
      .lt('booking_date', nextMonthStart)

    if (error) throw error

    const usedCount = count ?? 0
    return {
      ...empty,
      usedCount,
      remainingCount: Math.max(0, limitCount - usedCount),
    }
  } catch (error: any) {
    return { ...empty, success: false, error: error.message }
  }
}

// ===== SMS 발송 헬퍼 함수 =====
/**
 * 분기 기준은 '누구인가'가 아니라 '받을 돈이 남았는가'(booking.amount > 0)이다.
 * 세대원도 무료 시간을 초과하면 입금 안내를 받아야 하므로 회원/비회원으로 나눌 수 없다.
 */
async function sendBookingNotifications(
  booking: any,
  input: CreateBookingInput,
  normalizedPhone: string,
  charge: BookingCharge
) {
  const dateStr = new Date(booking.booking_date).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  })
  const timeStr = `${booking.start_time} ~ ${booking.end_time}`
  const spaceStr = booking.space === 'nolter' ? '놀터' : '방음실'
  const owesCash = (booking.amount ?? 0) > 0
  // 예: '무료 2시간 + 현금 1시간(14,000원)'. 템플릿에 {breakdown}을 넣으면 표시된다.
  const breakdown = describeCharge(charge)

  if (owesCash) {
    // 2-2: 입금 안내 (세대원·일반회원·비회원 공통)
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
        amount: booking.amount.toLocaleString(),
        account: process.env.BANK_ACCOUNT || '카카오뱅크 7979-72-56275 (정상은)',
        deadline: deadlineStr,
        breakdown,
      },
      bookingId: booking.id,
    })

    // 5-4: 재무담당자 즉시 알림
    await sendNotification({
      type: '5-4',
      phone: process.env.FINANCE_PHONE || '',
      recipientName: '재무담당자',
      variables: {
        name: input.name,
        phone: input.phone,
        date: dateStr,
        time: timeStr,
        space: spaceStr,
        amount: booking.amount.toLocaleString(),
        breakdown,
        adminUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/admin/bookings`,
      },
      bookingId: booking.id,
    })
  } else {
    // 2-1: 예약 완료 (전액 무료 또는 전액 선불권)
    await sendNotification({
      type: '2-1',
      phone: normalizedPhone,
      variables: {
        name: input.name,
        household: booking.household || '',
        date: dateStr,
        time: timeStr,
        space: spaceStr,
        breakdown,
      },
      bookingId: booking.id,
    })
  }

  // 6-4: 관리자 알림
  // 'mixed'는 이제 '선불권 + 미입금 현금'을 뜻하므로 더 이상 제외하지 않는다.
  const adminPhone = process.env.ADMIN_PHONE
  if (adminPhone) {
    const freeHoursUsed = Number(booking.free_hours_used ?? 0)
    const prepaidHoursUsed = Number(booking.prepaid_hours_used ?? 0)
    const category =
      freeHoursUsed > 0 && owesCash
        ? '세대무료+추가결제'
        : freeHoursUsed > 0
        ? '세대무료'
        : prepaidHoursUsed > 0 && !owesCash
        ? '선불권'
        : booking.member_type === 'member'
        ? '회원(유료)'
        : '비회원'

    await sendNotification({
      type: '6-4',
      phone: adminPhone,
      recipientName: '관리자',
      variables: {
        name: input.name,
        household: booking.household || '',
        phone: input.phone,
        date: dateStr,
        time: timeStr,
        space: spaceStr,
        category,
        breakdown,
        amount: owesCash ? booking.amount.toLocaleString() : '',
        adminUrl: `${process.env.NEXT_PUBLIC_APP_URL || ''}/admin/bookings`,
      },
      bookingId: booking.id,
    })
  }
}
