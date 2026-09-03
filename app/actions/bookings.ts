'use server'

import { createServiceRoleClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/sender'
import {
  BookingCharge,
  LEGACY_NOLTER_FREE_COUNT_PER_MONTH,
  PolicyVersion,
  RESIDENT_NOLTER_FREE_HOURS_PER_MONTH,
  describeCharge,
  monthRangeOf,
  resolvePolicyVersion,
  resolveUserKind,
  round1,
} from '@/lib/booking-policy'
// 조회 → 과금 계산 → RPC 생성 파이프라인은 관리자 소급 등록과 공용이다.
import { createBookingCore } from '@/lib/booking/create-core'
import { getKstNow } from '@/lib/date-kst'

// ===== 응답 컬럼 화이트리스트 =====
// 이 액션들은 모두 service role 로 읽는다. service role 은 RLS 를 우회하므로
// '무엇을 응답에 싣는가'는 전적으로 여기의 select 목록이 책임진다.
// select('*') 를 쓰면 phone / user_id / household / admin_note 까지 공개 달력으로 흘러간다.

/** 공개 달력이 실제로 읽는 컬럼. 이름은 세대원에게만 조건부로 더한다. */
const PUBLIC_CALENDAR_COLUMNS = 'booking_date, space, start_time, end_time'
/** 회원 본인 조회(mypage·예약관리 모달)가 읽는 컬럼. phone/user_id/household/admin_note 는 싣지 않는다. */
const MEMBER_BOOKING_COLUMNS =
  'id, booking_date, start_time, end_time, space, name, status, amount, payment_status, prepaid_hours_used'

/** 'id' 컬럼에 넣어도 PostgREST 가 22P02 로 죽지 않는 uuid 형식인지 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * 달력에 예약자 '이름'을 실어도 되는 뷰어인가 — 승인된 온음 세대원만 true.
 *
 * 지금까지 이 판정은 클라이언트(app/page.tsx 의 isMember)에만 있었는데,
 * 그건 렌더링 분기일 뿐 보호가 아니었다. 서버가 이름을 담아 내려보내는 이상
 * 비로그인 방문자도 네트워크 응답에서 전체 예약자 명단을 그대로 읽을 수 있었다.
 * 그래서 '이름을 실을지'를 서버에서 결정한다.
 *
 * 세대원 판정 기준은 예약 과금과 동일한 resolveUserKind() 를 쓴다 (is_resident && household).
 * 거기에 계정 상태(approved / 미삭제)만 더한다.
 */
async function canSeeBookerNames(
  supabase: Awaited<ReturnType<typeof createServiceRoleClient>>,
  viewerUserId?: string
): Promise<boolean> {
  // 형식이 어긋난 uuid 를 .eq('id', …) 에 넣으면 PostgREST 가 22P02 로 실패해
  // 달력 조회 전체가 죽는다. 조용히 익명 취급한다.
  if (!viewerUserId || !UUID_RE.test(viewerUserId)) return false

  const { data, error } = await supabase
    .from('users')
    .select('is_resident, household, status, deleted_at')
    .eq('id', viewerUserId)
    .maybeSingle()

  if (error || !data) return false
  if (data.status !== 'approved' || data.deleted_at) return false

  return (
    resolveUserKind({
      userId: viewerUserId,
      isResident: data.is_resident,
      household: data.household,
    }) === 'resident'
  )
}

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

    // ⭐ 날짜 검증 (서버 사이드)
    // 기준 시각은 반드시 KST 다. 예전에는 new Date() 를 썼는데 Vercel 이 UTC 라
    // KST 00:00~09:00 사이에는 서버가 보는 '오늘'이 아직 어제여서 당일 차단이 새고 있었다.
    // 당일 예약 가능 여부는 사용자 종류에 따라 갈리므로 아래 guards 안에서 판정한다.
    const kstNow = getKstNow()

    if (!Array.isArray(input.times) || input.times.length === 0) {
      return { success: false, error: '시간을 선택해주세요.' }
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.bookingDate)) {
      return { success: false, error: '예약 날짜가 올바르지 않습니다.' }
    }

    // 과거 날짜 예약 차단 (모든 사용자 공통)
    // 이미 지나간 사용분의 사후 기록은 관리자 소급 등록(createBookingAdmin)이 담당한다.
    if (input.bookingDate < kstNow.dateStr) {
      console.log(`⛔ 과거 날짜 예약 차단: ${input.bookingDate} (KST 오늘: ${kstNow.dateStr})`)
      return {
        success: false,
        error: '과거 날짜는 예약할 수 없습니다.'
      }
    }

    // 비회원 개인정보 수집 동의 확인
    if (input.memberType === 'non-member' && !input.consentGiven) {
      return { success: false, error: '개인정보 수집·이용에 동의해 주세요.' }
    }

    const isSameDayBooking = input.bookingDate === kstNow.dateStr
    const serviceSupabase = await createServiceRoleClient()

    // 조회 → 과금 계산 → RPC 생성은 관리자 소급 등록과 공용이다 (lib/booking/create-core.ts).
    // 이 경로에만 있는 판단(당일 차단)은 guards 로 주입한다.
    const result = await createBookingCore({
      serviceSupabase,
      input: {
        bookingDate: input.bookingDate,
        times: input.times,
        space: input.space,
        name: input.name,
        phone: input.phone,
        userId: input.userId,
      },
      guards: {
        // ===== 당일 예약 검증 =====
        // 온음 세대원만 당일 예약이 가능하고, 그것도 아직 시작하지 않은 시간대에 한한다.
        // 세션(localStorage)의 isResident 는 위조될 수 있으므로 DB에서 다시 읽은 userKind 로 판정한다.
        afterActorResolved: ({ actor, slots }) => {
          console.log('👤 예약 사용자 타입 해석', {
            userId: input.userId,
            isLoggedIn: input.isLoggedIn,
            isResident: actor.isResident,
            household: actor.household,
            space: input.space,
            requestedHours: slots.requestedHours,
            resolvedUserKind: actor.userKind,
            policyVersion: actor.policyVersion,
          })

          if (!isSameDayBooking) return null

          if (actor.userKind !== 'resident') {
            // 문구는 종전과 동일하게 유지한다 — 비세대원에게 세대원 혜택을 노출하지 않는다.
            console.log(`⛔ 당일 예약 차단(비세대원): ${input.bookingDate} / ${actor.userKind}`)
            return '당일 예약은 불가능합니다. 최소 1일 전에 예약해주세요.'
          }

          // times 는 코어에서 정렬해 두므로 첫 원소가 가장 이른 슬롯이다.
          if (slots.requestedMinutes[0] <= kstNow.minutes) {
            console.log(`⛔ 당일 예약 차단(지난 시간대): ${slots.times.join(',')} / 현재 ${kstNow.hhmm}`)
            return `이미 시작된 시간대는 예약할 수 없습니다. 현재 시각 ${kstNow.hhmm} 이후 시간대를 선택해주세요.`
          }

          return null
        },

        // 당일 예약은 결제가 필요한 순간 라이프사이클이 깨진다.
        // autoCancelUnpaid(lib/cron/jobs.ts)가 booking_date <= 오늘 인 미입금 건을 매일 00:00 KST 에
        // 취소하는데, 당일 예약은 그 시점이 '사용 후'다. 결과적으로 이미 쓴 세션이 조용히 취소되고
        // 무료 시간은 세대 한도로 반환되며(migrations/031: status <> 'cancelled') 매출 기록도 사라진다.
        // 그래서 당일은 무료/선불권으로 전액 커버되는 예약만 받는다.
        // 무료시간 경합으로 재계산되면 이 콜백이 다시 호출되므로 두 지점 모두에서 검사된다.
        afterCharge: ({ charge }) => {
          console.log('💰 과금 계산 결과', { ...charge, breakdown: describeCharge(charge) })

          if (!isSameDayBooking || charge.amount <= 0) return null
          console.log(`⛔ 당일 예약 차단(유료): ${input.bookingDate} / ${charge.amount}원`)
          return '당일 예약은 무료 시간 또는 선불권으로 이용 가능한 범위에서만 가능합니다. 결제가 필요한 예약은 하루 전까지 신청해주세요.'
        },
      },
    })

    if (!result.success) {
      console.error('❌ 예약 생성 실패:', result)
      // SLOT_TAKEN 은 '내 화면이 낡았다'는 뜻이다. code 를 그대로 올려보내
      // 클라이언트가 목록을 갱신하고 선택을 비울 수 있게 한다.
      return { success: false, error: result.error, code: result.code }
    }

    console.log('✅ Booking created:', result.booking)

    await sendBookingNotifications(result.booking, input, result.normalizedPhone!, result.charge!)

    // 캘린더 갱신
    revalidatePath('/')

    return { success: true, data: result.booking }
  } catch (error: any) {
    console.error('❌ Create booking error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 공개 달력용 예약 조회.
 *
 * @param viewerUserId 로그인한 사용자의 id(선택). 승인된 세대원일 때만 예약자 이름을 함께 내려준다.
 */
export async function getBookings(
  year: number,
  month: number,
  space: string,
  viewerUserId?: string
) {
  try {
    const supabase = await createServiceRoleClient()
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    // 해당 월의 마지막 날 계산 (Date(year, month, 0) = 이전 달의 마지막 날)
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

    const showNames = await canSeeBookerNames(supabase, viewerUserId)

    console.log('📅 Fetching bookings:', { year, month, space, startDate, endDate, showNames })

    const { data, error } = await supabase
      .from('bookings')
      .select(showNames ? `${PUBLIC_CALENDAR_COLUMNS}, name` : PUBLIC_CALENDAR_COLUMNS)
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
    const supabase = await createServiceRoleClient()
    console.log('🔍 Fetching bookings for phone:', phone)

    // 전화번호 정규화 (숫자만 추출)
    const normalizedPhone = phone.replace(/[^0-9]/g, '')
    
    // 오늘 날짜 (한국 시간)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = today.toISOString().split('T')[0]
    
    const { data, error } = await supabase
      .from('bookings')
      .select(MEMBER_BOOKING_COLUMNS)
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

    // 조회·업데이트·RPC 를 하나의 service role 클라이언트로 통일한다.
    // (아래 선불권 복구 RPC 가 service role 을 요구하는데, 예전엔 조회/업데이트만 anon 이었다)
    const supabase = await createServiceRoleClient()

    // 예약 존재 여부 확인
    // 여기의 booking 은 알림 문구·분기용 내부 값이고 응답으로 돌려주지 않으므로 '*' 그대로 둔다.
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
      // ⚠️ 반드시 service role 로 호출할 것. anon 키로 호출하면 prepaid_purchases/prepaid_usages
      //    RLS(auth.uid() 기반 — 이 앱은 커스텀 인증이라 항상 NULL)에 걸려 복구 UPDATE/DELETE 가
      //    에러 없이 0건 처리되고, 예약만 취소된 채 선불권 시간이 영구 유실된다.
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('cancel_booking_restore_prepaid', { p_booking_id: bookingId })

      if (rpcError) {
        console.error('❌ RPC error:', rpcError)
        throw rpcError
      }
      if (!rpcData?.success) {
        return { success: false, error: rpcData?.error || '선불권 복구 중 오류가 발생했습니다' }
      }
      // 복구량이 기대치와 다르면 복구가 조용히 실패한 것이다. 반드시 드러낸다.
      if (Number(rpcData.restoredHours) !== Number(rpcData.expectedHours ?? rpcData.restoredHours)) {
        console.error(
          '🚨 선불권 복구 불일치',
          { bookingId, restored: rpcData.restoredHours, expected: rpcData.expectedHours }
        )
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
    const supabase = await createServiceRoleClient()
    console.log('🏠 Fetching bookings by household:', household)

    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('bookings')
      .select(MEMBER_BOOKING_COLUMNS)
      .eq('household', household)
      .in('status', ['confirmed', 'pending'])
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
    const supabase = await createServiceRoleClient()
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('bookings')
      .select(MEMBER_BOOKING_COLUMNS)
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
    const supabase = await createServiceRoleClient()
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('bookings')
      .select(MEMBER_BOOKING_COLUMNS)
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
    const supabase = await createServiceRoleClient()
    const today = new Date().toISOString().split('T')[0]
    const { data, error } = await supabase
      .from('bookings')
      .select(MEMBER_BOOKING_COLUMNS)
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
  const supabase = await createServiceRoleClient()
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
      // head:true 라 행은 돌아오지 않지만, 이 파일에 select('*') 를 남기지 않기 위해 id 만 센다.
      .select('id', { count: 'exact', head: true })
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
