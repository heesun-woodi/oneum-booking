/**
 * 예약 생성 공용 코어 — 공개 예약(app/actions/bookings.ts)과
 * 관리자 소급 등록(app/actions/admin-bookings.ts)이 함께 쓴다.
 *
 * 이 모듈이 존재하는 이유는 하나다: '무료 → 선불권 → 현금' 배분과 RPC 호출이
 * 두 벌 존재하는 순간 두 경로의 과금이 갈라지기 때문이다.
 * 정책 계산 자체는 lib/booking-policy.ts 가, 트랜잭션은 RPC 가 담당하고,
 * 여기는 그 둘을 잇는 '조회 → 계산 → 생성' 파이프라인만 갖는다.
 *
 * 경로별로 다른 것은 계산이 아니라 '가드'다.
 *   - 공개 예약   : 과거/당일 예약 차단, 비회원 동의 필수, 예약 확정 문자 발송
 *   - 소급 등록   : 과거 날짜 허용(그게 목적), 문자 미발송, 관리자 기록 남김
 * 그래서 가드는 호출자가 콜백으로 주입하고, 이 모듈은 판단하지 않는다.
 *
 * 'use server' 를 붙이지 않는다 — 서버 액션이 아니라 두 액션이 공유하는 순수 헬퍼다.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  BookingCharge,
  PolicyVersion,
  PrepaidLike,
  RESIDENT_NOLTER_FREE_HOURS_PER_MONTH,
  SpaceType,
  UserKind,
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
import { timeToMinutes } from '@/lib/date-kst'

/** 예약 시간 슬롯을 파싱한 결과 */
export interface BookingSlots {
  /** 오름차순 정렬된 30분 슬롯 목록 */
  times: string[]
  /** 슬롯 시작 시각(분) 목록 — 당일 예약 판정에 쓴다 */
  requestedMinutes: number[]
  startTime: string
  endTime: string
  requestedHours: number
}

/** DB 에서 다시 읽어 확정한 예약자 정보 */
export interface ResolvedActor {
  userKind: UserKind
  /** member_type='member' 는 '온음 세대원'을 뜻한다 (로그인 회원 일반이 아니다) */
  memberType: 'member' | 'non-member'
  household: string | null
  isResident: boolean
  policyVersion: PolicyVersion
}

export interface BookingCoreInput {
  bookingDate: string
  times: string[]
  space: SpaceType
  name: string
  phone: string
  userId?: string
  /**
   * bookings.pii_consent_given 에 기록할 값.
   * 생략하면 기존 동작대로 memberType='non-member' 일 때 true 가 된다
   * (세대원이 아닌 예약자는 개인정보 동의를 받고 들어온다).
   */
  piiConsentGiven?: boolean
  /** 소급 등록한 관리자의 users.id (공개 예약은 null) */
  createdByAdmin?: string | null
  /** 소급 등록 사유 메모 (공개 예약은 null) */
  adminNote?: string | null
}

/**
 * 가드 콜백. 문자열을 반환하면 그 메시지로 예약을 거절하고,
 * null 을 반환하면 통과시킨다.
 */
export interface BookingGuards {
  /** 예약자 종류가 확정된 직후 (과금 계산 전) */
  afterActorResolved?: (ctx: { actor: ResolvedActor; slots: BookingSlots }) => string | null
  /**
   * 과금이 계산된 직후.
   * 무료시간 경합으로 재계산이 일어나면 다시 호출되므로 부수효과를 넣지 말 것.
   */
  afterCharge?: (ctx: {
    actor: ResolvedActor
    slots: BookingSlots
    charge: BookingCharge
  }) => string | null
}

export interface BookingCoreResult {
  success: boolean
  error?: string
  code?: string
  /** 생성된 bookings 행 (성공 시) */
  booking?: any
  charge?: BookingCharge
  actor?: ResolvedActor
  slots?: BookingSlots
  normalizedPhone?: string
}

/**
 * 30분 슬롯 배열을 start/end 로 환산한다.
 *
 * times 는 클라이언트 입력이라 정렬을 신뢰할 수 없다. 정렬하지 않으면
 * ['15:00','14:00'] 같은 입력이 end_time < start_time 인 행을 만들고,
 * 그런 행은 달력 슬롯 전개 루프에 걸리지 않아 예약이 통째로 안 보이게 된다.
 * ('HH:MM' 는 제로패딩이라 문자열 정렬 = 시간순)
 */
export function parseBookingSlots(
  rawTimes: string[]
): { ok: true; slots: BookingSlots } | { ok: false; error: string } {
  if (!Array.isArray(rawTimes) || rawTimes.length === 0) {
    return { ok: false, error: '시간을 선택해주세요.' }
  }

  const times = [...rawTimes].sort()
  const requestedMinutes = times.map(timeToMinutes)
  if (requestedMinutes.some(m => !Number.isFinite(m))) {
    return { ok: false, error: '시간 형식이 올바르지 않습니다.' }
  }

  // 슬롯이 이어져 있지 않으면 [start, end) 하나로 표현할 수 없다.
  // 공개 예약 UI 는 연속 선택만 허용하지만, 관리자 입력과 API 직접 호출은 그렇지 않다.
  // 이걸 막지 않으면 14:00 과 20:00 을 고른 요청이 14:00~20:30 한 건으로 저장되어
  // 그 사이 시간대가 통째로 점유된다.
  for (let i = 1; i < requestedMinutes.length; i++) {
    if (requestedMinutes[i] !== requestedMinutes[i - 1] + 30) {
      return { ok: false, error: '연속된 시간대만 한 건으로 예약할 수 있습니다.' }
    }
  }

  const startTime = times[0]
  // endTime = 마지막 슬롯의 종료 시간 (마지막 슬롯 + 30분)
  const endMinutes = requestedMinutes[requestedMinutes.length - 1] + 30
  const endTime = `${String(Math.floor(endMinutes / 60)).padStart(2, '0')}:${String(
    endMinutes % 60
  ).padStart(2, '0')}`

  return {
    ok: true,
    slots: {
      times,
      requestedMinutes,
      startTime,
      endTime,
      requestedHours: slotsToHours(times.length),
    },
  }
}

/**
 * 예약자 종류를 DB 기준으로 확정한다.
 *
 * 호출자가 넘긴 isResident/household 는 localStorage 세션에서 오는 값이라 위조될 수 있다.
 * 무료 시간이 걸린 판정이므로 항상 DB 에 저장된 값으로 다시 읽는다.
 */
export async function resolveBookingActor(
  serviceSupabase: SupabaseClient,
  userId: string | undefined,
  bookingDate: string
): Promise<{ ok: true; actor: ResolvedActor } | { ok: false; error: string }> {
  let isResident = false
  let household: string | null = null

  if (userId) {
    const { data: user, error } = await serviceSupabase
      .from('users')
      .select('id, is_resident, household')
      .eq('id', userId)
      .maybeSingle()

    if (error) throw error
    if (!user) {
      return { ok: false, error: '사용자 정보를 확인할 수 없습니다. 다시 로그인해주세요.' }
    }

    isResident = !!user.is_resident
    household = (user.household ?? '').trim() || null
  }

  const userKind = resolveUserKind({ userId, isResident, household })

  return {
    ok: true,
    actor: {
      userKind,
      memberType: userKind === 'resident' ? 'member' : 'non-member',
      household,
      isResident,
      // 정책은 신청 시점이 아니라 '사용일' 기준으로 갈린다 (v2 = 2026-08-01 사용분부터).
      policyVersion: resolvePolicyVersion(bookingDate),
    },
  }
}

/** [v1 전용] 세대의 해당 월 놀터 예약 '건수' (취소 제외). */
async function countHouseholdNolterBookings(
  serviceSupabase: SupabaseClient,
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

/** 과금 계산에 필요한 '현재 사용량' 스냅샷 */
interface ChargeContext {
  freeHoursUsedThisMonth: number
  legacyNolterBookingCount: number
  prepaidPurchases: PrepaidLike[]
}

/**
 * 무료 누적 사용량과 보유 선불권을 읽어 과금 계산의 입력을 만든다.
 *
 * 무료로 전부 커버되는 예약은 선불권을 조회조차 하지 않는다
 * (세대원이 방음실을 예약할 때 선불권이 소진되던 문제를 막는다).
 */
async function loadChargeContext(
  serviceSupabase: SupabaseClient,
  input: BookingCoreInput,
  actor: ResolvedActor,
  requestedHours: number
): Promise<ChargeContext> {
  let freeHoursUsedThisMonth = 0
  let legacyNolterBookingCount = 0

  if (actor.userKind === 'resident' && input.space === 'nolter' && actor.household) {
    if (actor.policyVersion === 'v2') {
      const { monthStart } = monthRangeOf(input.bookingDate)
      const { data, error } = await serviceSupabase.rpc('get_household_free_hours', {
        p_household: actor.household,
        p_month: monthStart,
      })
      if (error) throw error
      freeHoursUsedThisMonth = round1(Number(data ?? 0))
    } else {
      legacyNolterBookingCount = await countHouseholdNolterBookings(
        serviceSupabase,
        actor.household,
        input.bookingDate
      )
    }
  }

  const allowance = freeHoursAllowance(actor.userKind, input.space)
  const freeHoursLeft =
    allowance === Infinity ? Infinity : Math.max(0, round1(allowance - freeHoursUsedThisMonth))
  const canUsePrepaid = usesPrepaidHours(actor.policyVersion, actor.userKind, input.space)

  let prepaidPurchases: PrepaidLike[] = []
  if (input.userId && canUsePrepaid && requestedHours > freeHoursLeft) {
    const { data, error } = await serviceSupabase
      .from('prepaid_purchases')
      .select('id, remaining_hours, expires_at, status')
      .eq('user_id', input.userId)
      .eq('status', 'paid')
      .gt('remaining_hours', 0)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: true })

    if (error) throw error
    prepaidPurchases = (data ?? []) as PrepaidLike[]
  }

  return { freeHoursUsedThisMonth, legacyNolterBookingCount, prepaidPurchases }
}

/**
 * 실제 저장 없이 과금만 계산한다 (관리자 미리보기용).
 *
 * 미리보기와 실제 생성이 같은 조회·같은 계산식을 타야 '보여준 금액과 다르게 저장되는' 일이 없다.
 */
export async function previewBookingCharge(params: {
  serviceSupabase: SupabaseClient
  input: Pick<BookingCoreInput, 'bookingDate' | 'times' | 'space' | 'userId'>
}): Promise<
  | { success: true; charge: BookingCharge; actor: ResolvedActor; slots: BookingSlots; summary: string }
  | { success: false; error: string }
> {
  const parsed = parseBookingSlots(params.input.times)
  if (!parsed.ok) return { success: false, error: parsed.error }

  const resolved = await resolveBookingActor(
    params.serviceSupabase,
    params.input.userId,
    params.input.bookingDate
  )
  if (!resolved.ok) return { success: false, error: resolved.error }

  const ctx = await loadChargeContext(
    params.serviceSupabase,
    { ...params.input, name: '', phone: '' },
    resolved.actor,
    parsed.slots.requestedHours
  )

  const charge = computeBookingCharge({
    userKind: resolved.actor.userKind,
    space: params.input.space,
    bookingDate: params.input.bookingDate,
    requestedHours: parsed.slots.requestedHours,
    freeHoursUsedThisMonth: ctx.freeHoursUsedThisMonth,
    legacyNolterBookingCount: ctx.legacyNolterBookingCount,
    prepaidPurchases: ctx.prepaidPurchases,
  })

  return {
    success: true,
    charge,
    actor: resolved.actor,
    slots: parsed.slots,
    summary: describeCharge(charge),
  }
}

/** RPC 단일 생성 경로. 무료 한도 검증 → INSERT → 선불권 차감이 한 트랜잭션이다. */
async function callCreateBookingRpc(params: {
  serviceSupabase: SupabaseClient
  input: BookingCoreInput
  actor: ResolvedActor
  slots: BookingSlots
  charge: BookingCharge
  normalizedPhone: string
}) {
  const { serviceSupabase, input, actor, slots, charge, normalizedPhone } = params

  const { data, error } = await serviceSupabase.rpc('create_booking_with_prepaid', {
    p_booking_data: {
      bookingDate: input.bookingDate,
      startTime: slots.startTime,
      endTime: slots.endTime,
      space: input.space,
      memberType: actor.memberType,
      household: actor.household ?? '',
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
      piiConsentGiven: input.piiConsentGiven ?? actor.memberType === 'non-member',
      // 마이그레이션 035 이전 RPC 는 이 두 키를 무시한다 (예약은 정상 생성되고 메모만 빠진다).
      createdByAdmin: input.createdByAdmin ?? '',
      adminNote: input.adminNote ?? '',
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
    takenSlots?: string
  }
}

/**
 * 예약 생성 파이프라인: 예약자 확정 → 과금 계산 → RPC 생성.
 *
 * 과거/당일 차단, 동의 확인, 문자 발송처럼 경로마다 다른 판단은 하지 않는다.
 * 그건 guards 콜백과 호출자의 몫이다.
 */
export async function createBookingCore(params: {
  serviceSupabase: SupabaseClient
  input: BookingCoreInput
  guards?: BookingGuards
}): Promise<BookingCoreResult> {
  const { serviceSupabase, input, guards } = params

  const parsed = parseBookingSlots(input.times)
  if (!parsed.ok) return { success: false, error: parsed.error }
  const slots = parsed.slots

  // 전화번호 정규화 (숫자만 저장)
  const normalizedPhone = input.phone.replace(/[^0-9]/g, '')

  const resolved = await resolveBookingActor(serviceSupabase, input.userId, input.bookingDate)
  if (!resolved.ok) return { success: false, error: resolved.error }
  const actor = resolved.actor

  const actorRejection = guards?.afterActorResolved?.({ actor, slots })
  if (actorRejection) return { success: false, error: actorRejection }

  const ctx = await loadChargeContext(serviceSupabase, input, actor, slots.requestedHours)

  let charge = computeBookingCharge({
    userKind: actor.userKind,
    space: input.space,
    bookingDate: input.bookingDate,
    requestedHours: slots.requestedHours,
    freeHoursUsedThisMonth: ctx.freeHoursUsedThisMonth,
    legacyNolterBookingCount: ctx.legacyNolterBookingCount,
    prepaidPurchases: ctx.prepaidPurchases,
  })

  const chargeRejection = guards?.afterCharge?.({ actor, slots, charge })
  if (chargeRejection) return { success: false, error: chargeRejection }

  let rpcResult = await callCreateBookingRpc({
    serviceSupabase,
    input,
    actor,
    slots,
    charge,
    normalizedPhone,
  })

  if (!rpcResult?.success && rpcResult?.code === 'FREE_HOURS_EXCEEDED') {
    // 같은 세대의 동시 예약으로 무료 시간이 방금 줄었다.
    // 서버가 알려준 실측값으로 재계산해 딱 한 번만 재시도한다.
    console.warn('⚠️ 무료 시간 경합 감지, 재계산 후 1회 재시도', rpcResult)
    charge = computeBookingCharge({
      userKind: actor.userKind,
      space: input.space,
      bookingDate: input.bookingDate,
      requestedHours: slots.requestedHours,
      freeHoursUsedThisMonth: round1(Number(rpcResult.freeHoursUsed ?? 0)),
      legacyNolterBookingCount: ctx.legacyNolterBookingCount,
      prepaidPurchases: ctx.prepaidPurchases,
    })

    // 무료 시간이 줄면서 방금 유료로 바뀌었을 수 있다.
    // 첫 RPC 는 이미 실패해 행이 생기지 않았으므로 여기서 반환해도 안전하다.
    const retryRejection = guards?.afterCharge?.({ actor, slots, charge })
    if (retryRejection) return { success: false, error: retryRejection }

    rpcResult = await callCreateBookingRpc({
      serviceSupabase,
      input,
      actor,
      slots,
      charge,
      normalizedPhone,
    })
  }

  if (!rpcResult?.success) {
    // SLOT_TAKEN 은 '내 화면이 낡았다'는 뜻이다. code 를 그대로 올려보내
    // 호출자가 목록을 갱신하고 선택을 비울 수 있게 한다.
    const message =
      rpcResult?.code === 'SLOT_TAKEN'
        ? rpcResult.error || '이미 예약된 시간대입니다.'
        : rpcResult?.code === 'FREE_HOURS_EXCEEDED'
          ? '세대 무료 시간이 방금 소진되었습니다. 새로고침 후 다시 시도해주세요.'
          : rpcResult?.error || '예약 처리 중 오류가 발생했습니다.'

    return { success: false, error: message, code: rpcResult?.code, charge, actor, slots }
  }

  const { data: booking, error: fetchError } = await serviceSupabase
    .from('bookings')
    .select('*')
    .eq('id', rpcResult.bookingId)
    .single()

  if (fetchError) throw fetchError

  return { success: true, booking, charge, actor, slots, normalizedPhone }
}
