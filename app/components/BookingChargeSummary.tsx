'use client'

import type { HouseholdNolterQuota } from '@/app/actions/bookings'
import {
  PrepaidLike,
  SpaceType,
  UserKind,
  computeBookingCharge,
  formatHours,
  slotsToHours,
} from '@/lib/booking-policy'

const BANK_ACCOUNT = '카카오뱅크 7979-72-56275 (정상은)'

interface Props {
  userKind: UserKind
  space: SpaceType
  /** 사용일 'YYYY-MM-DD'. 적용 정책(v1/v2)을 가른다. */
  bookingDate: string
  /** 선택된 30분 슬롯 개수 */
  selectedSlotCount: number
  /** 세대 놀터 한도 현황 (세대원 + 놀터일 때만 조회됨). 조회 중이면 null */
  quota: HouseholdNolterQuota | null
  prepaidPurchases: PrepaidLike[]
  /** 예약하려는 달 (1~12). 한도는 사용일이 속한 달 기준이다. */
  monthLabel: number
}

/**
 * 예약 모달의 요금 안내.
 *
 * 서버(app/actions/bookings.ts)와 같은 computeBookingCharge를 호출하므로
 * 여기 표시되는 금액이 실제 청구 금액과 일치한다.
 */
export function BookingChargeSummary({
  userKind,
  space,
  bookingDate,
  selectedSlotCount,
  quota,
  prepaidPurchases,
  monthLabel,
}: Props) {
  const isResident = userKind === 'resident'
  const showsNolterQuota = isResident && space === 'nolter'
  const requestedHours = slotsToHours(selectedSlotCount)

  // 사용량을 아직 못 받았으면 계산을 보류한다 (잘못된 금액을 잠깐이라도 보여주지 않는다)
  if (showsNolterQuota && quota === null) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
        <p className="text-sm text-gray-500">이번 달 무료 이용 현황 조회 중...</p>
      </div>
    )
  }

  const charge = computeBookingCharge({
    userKind,
    space,
    bookingDate,
    requestedHours,
    freeHoursUsedThisMonth: quota?.usedHours ?? 0,
    legacyNolterBookingCount: quota?.usedCount ?? 0,
    prepaidPurchases,
  })

  const isLegacy = charge.policyVersion === 'v1'
  const totalPrepaidLeft = prepaidPurchases.reduce((sum, p) => sum + Number(p.remaining_hours), 0)
  const hasQuotaLeft = quota
    ? isLegacy
      ? quota.remainingCount > 0
      : quota.remainingHours > 0
    : false

  return (
    <div className="space-y-3">
      {/* 세대 무료 한도 현황 */}
      {showsNolterQuota && quota && (
        <div
          className={`rounded-lg p-4 border ${
            hasQuotaLeft ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}
        >
          <p
            className={`text-sm font-semibold ${
              hasQuotaLeft ? 'text-green-800' : 'text-yellow-800'
            }`}
          >
            {isLegacy
              ? `🎟 ${monthLabel}월 무료 예약: ${quota.usedCount}/${quota.limitCount}회 사용`
              : `🎟 ${monthLabel}월 세대 무료: ${formatHours(quota.usedHours)} / ${formatHours(
                  quota.limitHours
                )} 사용`}
          </p>

          <div className="w-full bg-white/70 rounded-full h-2 my-2">
            <div
              className={`h-2 rounded-full transition-all ${
                hasQuotaLeft ? 'bg-green-400' : 'bg-yellow-400'
              }`}
              style={{
                width: `${
                  isLegacy
                    ? quota.limitCount > 0
                      ? Math.min(100, (quota.usedCount / quota.limitCount) * 100)
                      : 0
                    : quota.limitHours > 0
                    ? Math.min(100, (quota.usedHours / quota.limitHours) * 100)
                    : 0
                }%`,
              }}
            />
          </div>

          <p className={`text-xs ${hasQuotaLeft ? 'text-green-600' : 'text-yellow-700'}`}>
            {isLegacy
              ? hasQuotaLeft
                ? `남은 무료 횟수: ${quota.remainingCount}회 (시간 제한 없음)`
                : '무료 횟수를 모두 사용했습니다. 추가 예약은 10,000원/건입니다.'
              : hasQuotaLeft
              ? `남은 무료 시간: ${formatHours(quota.remainingHours)}`
              : '무료 시간을 모두 사용했습니다. 이후 이용은 선불권 차감 또는 14,000원/시간입니다.'}
          </p>

          {isLegacy && (
            <p className="text-xs text-gray-500 mt-2">
              ℹ️ 2026년 8월 예약부터는 세대당 <strong>월 20시간 무료</strong>로 바뀝니다.
            </p>
          )}
        </div>
      )}

      {/* 방음실 세대원 안내 */}
      {isResident && space === 'soundroom' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-green-800">🎵 방음실은 세대원 무제한 무료입니다</p>
          <p className="text-xs text-green-600 mt-1">놀터 무료 한도와 별개로 운영됩니다.</p>
        </div>
      )}

      {/* 보유 선불권 */}
      {totalPrepaidLeft > 0 && selectedSlotCount === 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm font-semibold text-blue-800">
            🎫 보유 선불권: {formatHours(totalPrepaidLeft)}
          </p>
          <p className="text-xs text-blue-600 mt-1">시간을 선택하면 예상 결제 내역이 표시됩니다.</p>
        </div>
      )}

      {/* 예상 결제 내역 */}
      {selectedSlotCount > 0 && (
        <div
          className={`rounded-lg p-4 border ${
            charge.amount > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'
          }`}
        >
          <p
            className={`text-sm font-semibold mb-2 ${
              charge.amount > 0 ? 'text-yellow-800' : 'text-green-800'
            }`}
          >
            {charge.amount > 0 ? '💰 예상 결제 내역' : '✅ 예약 내역'} — 총{' '}
            {formatHours(charge.totalHours)}
          </p>

          <div className="text-sm space-y-1 text-gray-700">
            {charge.freeHours > 0 && <p>🎟 무료 {formatHours(charge.freeHours)}</p>}
            {charge.prepaidHours > 0 && (
              <p>
                🎫 선불권 {formatHours(charge.prepaidHours)}
                <span className="text-xs text-gray-500 ml-1">
                  (잔여 {formatHours(totalPrepaidLeft - charge.prepaidHours)})
                </span>
              </p>
            )}
            {charge.paymentMethod === 'nolter_paid' ? (
              <p>
                💰 무료 횟수 초과 — <strong>{charge.amount.toLocaleString()}원</strong>
                <span className="text-xs text-gray-500 ml-1">(이용 시간 무관 정액)</span>
              </p>
            ) : (
              charge.regularHours > 0 && (
                <p>
                  💳 현금 결제 {formatHours(charge.regularHours)} —{' '}
                  <strong>{charge.amount.toLocaleString()}원</strong>
                </p>
              )
            )}
          </div>

          {charge.amount > 0 ? (
            <div className="mt-2 pt-2 border-t border-yellow-200">
              <p className="text-xs text-yellow-700">입금계좌: {BANK_ACCOUNT}</p>
              <p className="text-xs text-yellow-600 mt-1">예약자명으로 입금해주세요.</p>
            </div>
          ) : (
            <p className="text-xs text-green-600 mt-2">결제 금액 없이 바로 확정됩니다.</p>
          )}

          {/* 한도 근처에서는 서버 재계산으로 금액이 달라질 수 있음을 알린다 */}
          {showsNolterQuota &&
            !isLegacy &&
            charge.freeHours > 0 &&
            charge.freeHoursRemainingAfter < 2 && (
              <p className="text-xs text-gray-500 mt-2">
                같은 세대에서 동시에 예약하면 최종 금액이 달라질 수 있습니다. 확정 금액은 예약 완료
                시점에 다시 계산됩니다.
              </p>
            )}
        </div>
      )}
    </div>
  )
}
