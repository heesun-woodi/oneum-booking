/**
 * 예약 요금 정책 (클라이언트/서버 공용)
 *
 * 이 파일은 런타임 의존성이 없는 순수 모듈이어야 한다.
 * 'use server' / 'use client' 지시자도, @/lib/supabase* 같은 서버 전용 모듈도 넣지 말 것.
 * app/page.tsx(클라이언트 컴포넌트)와 app/actions/bookings.ts(서버 액션)가
 * 같은 계산식을 쓰게 하는 것이 목적이다.
 *
 * 정책은 '사용일(booking_date)' 기준으로 두 가지가 공존한다.
 *
 * v2 — 2026-08-01 사용분부터 (Phase 8)
 *  - 온음 세대: 놀터를 세대당 월 20시간 무료, 방음실은 무제한 무료
 *  - 무료 시간은 한 예약 안에서 부분 소진된다 (잔여 2시간 + 3시간 예약 → 2시간 무료 + 1시간 과금)
 *  - 무료 소진 후에는 선불권 우선 차감 → 남은 시간만 14,000원/시간 현금
 *
 * v1 — 2026-07-31 사용분까지 (Phase 7, 종전 규정)
 *  - 온음 세대: 놀터를 세대당 월 3회 무료(시간 무관), 4회차부터 10,000원/건
 *  - 세대원 놀터 예약에는 선불권을 쓰지 않는다
 *  - 방음실은 무제한 무료 (v2와 동일)
 *
 * 정리 시점: 2026년 9월 이후에는 v1 경로를 타는 신규 예약이 생길 수 없다.
 * 그때 resolvePolicyVersion / v1 분기 / 전환 안내 문구를 제거하면 된다.
 * (과거 nolter_paid 행 조회는 계속 필요하므로 CHECK 값과 표시 로직은 유지할 것)
 */

/** 일반 이용 요금 (원/시간) */
export const HOURLY_RATE = 14000

/** 예약 슬롯 단위 (분) */
export const SLOT_MINUTES = 30

/** 슬롯 1개당 시간 */
export const HOURS_PER_SLOT = SLOT_MINUTES / 60

/** 온음 세대: 놀터 세대당 월 무료 이용 시간 (v2) */
export const RESIDENT_NOLTER_FREE_HOURS_PER_MONTH = 20

/** 새 정책 시행일 — 이 날짜 이후 '사용일'부터 v2가 적용된다 */
export const POLICY_V2_EFFECTIVE_FROM = '2026-08-01'

/** 종전 규정(v1): 놀터 세대당 월 무료 예약 '건수' */
export const LEGACY_NOLTER_FREE_COUNT_PER_MONTH = 3

/** 종전 규정(v1): 무료 횟수 초과 시 건당 정액 (이용 시간 무관) */
export const LEGACY_NOLTER_OVER_QUOTA_FEE = 10000

export type PolicyVersion = 'v1' | 'v2'

/**
 * 사용일이 어느 정책을 따르는지 판정한다.
 * 'YYYY-MM-DD' 문자열은 사전순 비교가 날짜순과 일치하므로 그대로 비교한다.
 */
export function resolvePolicyVersion(bookingDate: string): PolicyVersion {
  return bookingDate >= POLICY_V2_EFFECTIVE_FROM ? 'v2' : 'v1'
}

/**
 * 이 조합이 선불권을 소진할 수 있는가.
 * v1의 세대원 놀터 예약은 무료 아니면 정액 10,000원이라 선불권이 개입하지 않았다.
 */
export function usesPrepaidHours(
  version: PolicyVersion,
  kind: UserKind,
  space: SpaceType
): boolean {
  return !(version === 'v1' && kind === 'resident' && space === 'nolter')
}

export type SpaceType = 'nolter' | 'soundroom'

/**
 * - resident : 온음 세대원 (is_resident = true 이며 세대 번호를 가진 사용자)
 * - member   : 로그인한 일반 회원 (무료 시간 없음, 선불권 사용 가능)
 * - guest    : 비로그인 비회원 (무료 시간·선불권 모두 없음)
 */
export type UserKind = 'resident' | 'member' | 'guest'

/**
 * bookings.payment_method — '금전' 차원만 표현한다. 무료 소진 여부는 freeHours로 판단할 것.
 * 'nolter_paid'는 v1(2026-07-31 이전 사용분)의 놀터 정액 10,000원 예약에만 쓴다.
 */
export type PaymentMethod = 'free' | 'prepaid' | 'mixed' | 'regular' | 'nolter_paid'

/** prepaid_purchases 중 계산에 필요한 최소 형태 */
export interface PrepaidLike {
  id: string
  remaining_hours: number
  expires_at: string | null
  status: string
}

export interface DeductionPlanItem {
  purchaseId: string
  hoursToDeduct: number
}

export interface ComputeBookingChargeInput {
  userKind: UserKind
  space: SpaceType
  /** 사용일 'YYYY-MM-DD'. 어느 정책(v1/v2)을 적용할지 결정한다. */
  bookingDate: string
  /** 예약 요청 시간 (0.5시간 단위) */
  requestedHours: number
  /** [v2] 이번 달 세대 놀터 무료 누적 사용 '시간'. 그 외 조합에서는 무시된다. */
  freeHoursUsedThisMonth: number
  /** [v1] 이번 달 세대 놀터 예약 '건수'. v2에서는 무시된다. */
  legacyNolterBookingCount?: number
  /** 보유 선불권 (필터링 전 원본을 넘겨도 된다) */
  prepaidPurchases: PrepaidLike[]
  /** 선불권 유효기간 판정 기준 시각 (기본: 현재) */
  now?: Date
  /** [v2] 무료 한도 오버라이드 (기본 20) */
  freeHoursLimit?: number
}

export interface BookingCharge {
  policyVersion: PolicyVersion
  totalHours: number
  freeHours: number
  prepaidHours: number
  regularHours: number
  /** 현금 입금이 필요한 금액 (원) */
  amount: number
  paymentMethod: PaymentMethod
  deductionPlan: DeductionPlanItem[]
  /**
   * bookings.free_hours_used 에 기록할 값 (놀터 20시간 원장).
   * 방음실 무제한 무료와 v1(건수제)은 이 원장을 쓰지 않으므로 0이다.
   */
  freeHoursUsedLedger: number
  /** [v2] 이 예약 후 남는 무료 시간. 무제한(방음실 세대원)이면 0을 반환한다. */
  freeHoursRemainingAfter: number
  /** 세대원 + 방음실 = 한도 없는 무료 */
  usesUnlimitedFree: boolean
}

/** 0.1시간 단위로 반올림 (부동소수 누적 오차 방지) */
export function round1(n: number): number {
  if (!Number.isFinite(n)) return n
  return Math.round(n * 10) / 10
}

/** 30분 슬롯 개수 → 시간 */
export function slotsToHours(slotCount: number): number {
  return round1(slotCount * HOURS_PER_SLOT)
}

/** 'YYYY-MM-DD' 또는 'YYYY-MM' → 'YYYY-MM' */
export function monthKeyOf(isoDate: string): string {
  return isoDate.substring(0, 7)
}

/**
 * 'YYYY-MM' 또는 'YYYY-MM-DD'가 속한 달의 [시작일, 익월 시작일)
 *
 * 무료 한도는 신청 시점이 아니라 '사용일(booking_date)이 속한 달' 기준으로 판정한다.
 */
export function monthRangeOf(dateStr: string): { monthStart: string; nextMonthStart: string } {
  const [year, month] = dateStr.split('-').map(Number)
  const nextYear = month === 12 ? year + 1 : year
  const nextMonth = month === 12 ? 1 : month + 1
  return {
    monthStart: `${year}-${String(month).padStart(2, '0')}-01`,
    nextMonthStart: `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`,
  }
}

/**
 * 사용자 종류 판정.
 *
 * 세대 번호가 없는 '세대원'은 무료 한도를 집계할 키가 없으므로 일반 회원으로 취급한다.
 * (그렇지 않으면 세대 번호 없는 예약이 하나의 가상 세대로 뭉쳐 20시간을 공유하게 된다)
 */
export function resolveUserKind(opts: {
  userId?: string | null
  isResident?: boolean | null
  household?: string | null
}): UserKind {
  if (!opts.userId) return 'guest'
  if (opts.isResident && (opts.household ?? '').trim() !== '') return 'resident'
  return 'member'
}

/** 이 사용자/공간 조합의 월 무료 한도. 방음실 세대원은 무제한(Infinity). */
export function freeHoursAllowance(kind: UserKind, space: SpaceType): number {
  if (kind !== 'resident') return 0
  return space === 'soundroom' ? Infinity : RESIDENT_NOLTER_FREE_HOURS_PER_MONTH
}

/**
 * 사용 가능한 선불권만 골라 만료 임박 순 → 잔여 적은 순으로 정렬 (자투리 먼저 소진)
 */
export function selectUsablePrepaid(
  purchases: PrepaidLike[] | undefined | null,
  now: Date = new Date()
): PrepaidLike[] {
  return (purchases ?? [])
    .filter(
      p =>
        p.status === 'paid' &&
        Number(p.remaining_hours) > 0 &&
        !!p.expires_at &&
        new Date(p.expires_at as string) > now
    )
    .sort((a, b) => {
      const diff =
        new Date(a.expires_at as string).getTime() - new Date(b.expires_at as string).getTime()
      if (diff !== 0) return diff
      return Number(a.remaining_hours) - Number(b.remaining_hours)
    })
}

/**
 * 예약 요청 시간을 무료 → 선불권 → 현금 순으로 배분한다.
 *
 * 무료로 전부 커버되면 선불권은 아예 건드리지 않는다.
 * (세대원이 방음실을 예약할 때 선불권이 소진되던 문제를 막는다)
 */
export function computeBookingCharge(input: ComputeBookingChargeInput): BookingCharge {
  const policyVersion = resolvePolicyVersion(input.bookingDate)
  if (policyVersion === 'v1') return computeLegacyCharge(input)

  const limit = input.freeHoursLimit ?? RESIDENT_NOLTER_FREE_HOURS_PER_MONTH
  const totalHours = round1(input.requestedHours)

  // 1) 무료 시간
  const allowance = freeHoursAllowance(input.userKind, input.space)
  const usesUnlimitedFree = allowance === Infinity
  const freeLeft = usesUnlimitedFree
    ? Infinity
    : Math.max(0, round1(Math.min(allowance, limit) - input.freeHoursUsedThisMonth))
  const freeHours = round1(Math.min(totalHours, freeLeft))

  // 2) 선불권 (만료 임박 순)
  let remaining = round1(totalHours - freeHours)
  const deductionPlan: DeductionPlanItem[] = []
  let prepaidHours = 0

  if (remaining > 0) {
    for (const purchase of selectUsablePrepaid(input.prepaidPurchases, input.now)) {
      if (remaining <= 0) break
      const hoursToDeduct = round1(Math.min(round1(Number(purchase.remaining_hours)), remaining))
      if (hoursToDeduct <= 0) continue
      deductionPlan.push({ purchaseId: purchase.id, hoursToDeduct })
      prepaidHours = round1(prepaidHours + hoursToDeduct)
      remaining = round1(remaining - hoursToDeduct)
    }
  }

  // 3) 남은 시간은 현금 결제
  const regularHours = round1(remaining)
  const amount = Math.round(regularHours * HOURLY_RATE)

  // 4) payment_method는 '돈' 차원만 표현한다
  const paymentMethod: PaymentMethod =
    prepaidHours > 0 && regularHours > 0
      ? 'mixed'
      : prepaidHours > 0
      ? 'prepaid'
      : regularHours > 0
      ? 'regular'
      : 'free'

  return {
    policyVersion,
    totalHours,
    freeHours,
    prepaidHours,
    regularHours,
    amount,
    paymentMethod,
    deductionPlan,
    // 방음실 무제한 무료는 20시간 원장을 소진하지 않는다
    freeHoursUsedLedger: usesUnlimitedFree ? 0 : freeHours,
    freeHoursRemainingAfter: usesUnlimitedFree ? 0 : round1(Math.max(0, freeLeft - freeHours)),
    usesUnlimitedFree,
  }
}

/**
 * 종전 규정(v1, 2026-07-31 사용분까지) 계산.
 *
 * 세대원 놀터는 '건수' 기준이라 시간 원장(free_hours_used)을 쓰지 않는다.
 * 무료 횟수를 넘기면 이용 시간과 무관하게 정액 10,000원이다.
 */
function computeLegacyCharge(input: ComputeBookingChargeInput): BookingCharge {
  const totalHours = round1(input.requestedHours)
  const isResident = input.userKind === 'resident'

  const base = {
    policyVersion: 'v1' as const,
    totalHours,
    freeHoursUsedLedger: 0,
    freeHoursRemainingAfter: 0,
  }

  // 세대원 놀터: 월 3회까지 무료, 이후 건당 10,000원. 선불권은 개입하지 않는다.
  if (isResident && input.space === 'nolter') {
    const usedCount = input.legacyNolterBookingCount ?? 0
    const isFree = usedCount < LEGACY_NOLTER_FREE_COUNT_PER_MONTH

    return {
      ...base,
      freeHours: isFree ? totalHours : 0,
      prepaidHours: 0,
      regularHours: isFree ? 0 : totalHours,
      amount: isFree ? 0 : LEGACY_NOLTER_OVER_QUOTA_FEE,
      paymentMethod: isFree ? 'free' : 'nolter_paid',
      deductionPlan: [],
      usesUnlimitedFree: false,
    }
  }

  // 세대원 방음실: 무제한 무료 (선불권 미차감 — v2와 동일)
  if (isResident && input.space === 'soundroom') {
    return {
      ...base,
      freeHours: totalHours,
      prepaidHours: 0,
      regularHours: 0,
      amount: 0,
      paymentMethod: 'free',
      deductionPlan: [],
      usesUnlimitedFree: true,
    }
  }

  // 일반 회원 / 비회원: 선불권 → 14,000원/시간 (이 경로는 정책 변경과 무관하다)
  let remaining = totalHours
  const deductionPlan: DeductionPlanItem[] = []
  let prepaidHours = 0

  for (const purchase of selectUsablePrepaid(input.prepaidPurchases, input.now)) {
    if (remaining <= 0) break
    const hoursToDeduct = round1(Math.min(round1(Number(purchase.remaining_hours)), remaining))
    if (hoursToDeduct <= 0) continue
    deductionPlan.push({ purchaseId: purchase.id, hoursToDeduct })
    prepaidHours = round1(prepaidHours + hoursToDeduct)
    remaining = round1(remaining - hoursToDeduct)
  }

  const regularHours = round1(remaining)

  return {
    ...base,
    freeHours: 0,
    prepaidHours,
    regularHours,
    amount: Math.round(regularHours * HOURLY_RATE),
    paymentMethod:
      prepaidHours > 0 && regularHours > 0
        ? 'mixed'
        : prepaidHours > 0
        ? 'prepaid'
        : regularHours > 0
        ? 'regular'
        : 'free',
    deductionPlan,
    usesUnlimitedFree: false,
  }
}

/** 알림 문자·완료 안내에 쓰는 한 줄 요약 */
export function describeCharge(charge: BookingCharge): string {
  // v1 정액 요금은 시간과 무관하므로 별도 문구를 쓴다
  if (charge.paymentMethod === 'nolter_paid') {
    return `무료 횟수 초과 (${charge.amount.toLocaleString()}원)`
  }

  const parts: string[] = []
  if (charge.freeHours > 0) parts.push(`무료 ${formatHours(charge.freeHours)}`)
  if (charge.prepaidHours > 0) parts.push(`선불권 ${formatHours(charge.prepaidHours)}`)
  if (charge.regularHours > 0) {
    parts.push(`현금 ${formatHours(charge.regularHours)}(${charge.amount.toLocaleString()}원)`)
  }
  return parts.join(' + ')
}

/** 2 → '2시간', 1.5 → '1.5시간' */
export function formatHours(hours: number): string {
  const rounded = round1(hours)
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}시간`
}
