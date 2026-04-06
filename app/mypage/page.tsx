'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBookingsByHousehold, getPastBookingsByHousehold } from '@/app/actions/bookings'
import { getMonthlyUsage, UsageCount } from '@/app/actions/usage'
import { changePassword } from '@/app/actions/auth'
import { getPrepaidByPhone } from '@/app/actions/prepaid'
import { PREPAID_STATUS_LABELS, BOOKING_STATUS_LABELS } from '@/lib/constants/status-labels'

interface UserSession {
  isLoggedIn: boolean
  household: string
  name: string
  phone: string
  userId?: string
}

interface Booking {
  id: string
  booking_date: string
  start_time: string
  end_time: string
  space: string
  status: string
  amount: number
  payment_status: string
  prepaid_hours_used?: number
}

interface PrepaidPurchase {
  id: string
  status: string
  total_hours: number
  remaining_hours: number
  purchased_at: string
  paid_at: string | null
  expires_at: string | null
  created_at: string
  product?: {
    name: string
    price: number
    hours: number
  }
}

const SPACE_LABEL: Record<string, string> = { nolter: '놀터', soundroom: '방음실' }


type Tab = 'upcoming' | 'past' | 'prepaid'

export default function MyPage() {
  const router = useRouter()
  const [session, setSession] = useState<UserSession | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [prepaidPurchases, setPrepaidPurchases] = useState<PrepaidPurchase[]>([])
  const [monthlyUsage, setMonthlyUsage] = useState<UsageCount[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem('oneumSession')
    if (!saved) {
      router.push('/')
      return
    }
    const s: UserSession = JSON.parse(saved)
    if (!s.isLoggedIn) {
      router.push('/')
      return
    }
    setSession(s)
  }, [router])

  useEffect(() => {
    if (!session) return
    loadAll(session)
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadAll(s: UserSession) {
    setLoading(true)
    // 선불권은 항상 phone으로 직접 조회 (Server Action, 캐시 문제 없음)
    const prepaidPromise = s.phone
      ? getPrepaidByPhone(s.phone).then(result => { if (result.success) setPrepaidPurchases(result.data) })
      : Promise.resolve()

    await Promise.all([
      loadBookings(s.household),
      prepaidPromise,
      loadUsage(s.household),
    ])
    setLoading(false)
  }

  async function loadBookings(household: string) {
    const [upcoming, past] = await Promise.all([
      getBookingsByHousehold(household),
      getPastBookingsByHousehold(household),
    ])
    if (upcoming.success) setUpcomingBookings(upcoming.data as Booking[])
    if (past.success) setPastBookings(past.data as Booking[])
  }

  async function loadUsage(household: string) {
    const res = await getMonthlyUsage(household)
    if (res.success) setMonthlyUsage(res.usage)
  }

  const activePrepaid = prepaidPurchases.find((p) => p.status === 'paid')

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            ← 홈으로
          </Link>
          <h1 className="text-lg font-bold text-gray-900">마이페이지</h1>
          <div className="w-16" />
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* 프로필 카드 */}
        <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-2xl">
              🏠
            </div>
            <div>
              {session.household?.trim()
                ? <p className="text-xl font-bold text-gray-900">{session.household}호</p>
                : <p className="text-xl font-bold text-gray-900">{session.name}</p>
              }
              {session.household?.trim() && <p className="text-gray-600">{session.name}</p>}
              <p className="text-sm text-gray-400">{session.phone}</p>
            </div>
            {activePrepaid && (
              <div className="ml-auto text-right">
                <p className="text-xs text-gray-400">선불권 잔여</p>
                <p className="text-2xl font-bold text-blue-600">{activePrepaid.remaining_hours}
                  <span className="text-sm font-normal text-gray-500">시간</span>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* 비밀번호 변경 */}
        {session.userId && (
          <PasswordChangeCard userId={session.userId} />
        )}

        {/* 이번 달 이용 현황 */}
        {(() => {
          const totalUsed = monthlyUsage.reduce((sum, u) => sum + u.effectiveCount, 0)
          const FREE_LIMIT = 3
          const remaining = Math.max(0, FREE_LIMIT - totalUsed)
          const nolterUsed = monthlyUsage.find(u => u.space === 'nolter')?.effectiveCount ?? 0
          const soundroomUsed = monthlyUsage.find(u => u.space === 'soundroom')?.effectiveCount ?? 0
          return (
            <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
              <h2 className="text-sm font-semibold text-gray-500 mb-3">이번 달 무료 이용 현황</h2>
              <div className="flex items-center justify-between mb-3">
                <div className="text-center">
                  <p className="text-3xl font-bold text-blue-600">{remaining}</p>
                  <p className="text-xs text-gray-400 mt-1">남은 무료 횟수</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-700">{totalUsed}</p>
                  <p className="text-xs text-gray-400 mt-1">이번 달 이용</p>
                </div>
                <div className="text-center">
                  <p className="text-3xl font-bold text-gray-300">{FREE_LIMIT}</p>
                  <p className="text-xs text-gray-400 mt-1">월 무료 한도</p>
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-3">
                <div
                  className={`h-2 rounded-full transition-all ${totalUsed >= FREE_LIMIT ? 'bg-red-400' : 'bg-blue-400'}`}
                  style={{ width: `${Math.min(100, (totalUsed / FREE_LIMIT) * 100)}%` }}
                />
              </div>
              <div className="flex gap-3 text-xs text-gray-500">
                <span>놀터 {nolterUsed}회</span>
                <span>방음실 {soundroomUsed}회</span>
                {totalUsed >= FREE_LIMIT && (
                  <span className="text-red-500 font-medium ml-auto">무료 이용 초과 (선불권 또는 현장 결제)</span>
                )}
              </div>
            </div>
          )
        })()}

        {/* 탭 */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6">
          {([
            { key: 'upcoming', label: `예약 현황 (${upcomingBookings.length})` },
            { key: 'past', label: '지난 예약' },
            { key: 'prepaid', label: `선불권 (${prepaidPurchases.length})` },
          ] as { key: Tab; label: string }[]).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 */}
        {tab === 'upcoming' && (
          <BookingList bookings={upcomingBookings} emptyMsg="예정된 예약이 없습니다." />
        )}
        {tab === 'past' && (
          <BookingList bookings={pastBookings} emptyMsg="지난 예약 내역이 없습니다." isPast />
        )}
        {tab === 'prepaid' && (
          <PrepaidList
            purchases={prepaidPurchases}
            userId={session.userId}
            onRefresh={() => session.phone && getPrepaidByPhone(session.phone).then(r => { if (r.success) setPrepaidPurchases(r.data) })}
          />
        )}
      </div>
    </div>
  )
}

function BookingList({
  bookings,
  emptyMsg,
  isPast = false,
}: {
  bookings: Booking[]
  emptyMsg: string
  isPast?: boolean
}) {
  if (bookings.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
        {emptyMsg}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {bookings.map((b) => {
        const statusInfo = BOOKING_STATUS_LABELS[b.status] ?? { label: b.status, className: 'bg-gray-100 text-gray-500' }
        const dateObj = new Date(b.booking_date)
        const dateStr = dateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })

        return (
          <div
            key={b.id}
            className={`bg-white rounded-2xl shadow-sm p-4 ${isPast ? 'opacity-70' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900">{dateStr}</p>
                <p className="text-sm text-gray-600 mt-0.5">
                  {b.start_time} ~ {b.end_time} · {SPACE_LABEL[b.space] ?? b.space}
                </p>
                {b.prepaid_hours_used && b.prepaid_hours_used > 0 ? (
                  <p className="text-xs text-blue-600 mt-1">🎟️ 선불권 {b.prepaid_hours_used}시간 사용</p>
                ) : b.amount > 0 ? (
                  <p className="text-xs text-gray-400 mt-1">{b.amount.toLocaleString()}원</p>
                ) : null}
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function PasswordChangeCard({ userId }: { userId: string }) {
  const [isOpen, setIsOpen] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit() {
    setError('')
    if (!currentPassword.trim()) {
      setError('현재 비밀번호를 입력해주세요.')
      return
    }
    if (newPassword.length < 4) {
      setError('새 비밀번호는 4자 이상이어야 합니다.')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }
    setLoading(true)
    const result = await changePassword(userId, currentPassword, newPassword)
    setLoading(false)
    if (!result.success) {
      setError(result.error || '비밀번호 변경에 실패했습니다.')
      return
    }
    alert('비밀번호가 변경되었습니다.')
    setIsOpen(false)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 mb-6">
      <button
        onClick={() => { setIsOpen(!isOpen); setError('') }}
        className="w-full flex items-center justify-between text-sm font-semibold text-gray-700"
      >
        <span>비밀번호 변경</span>
        <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
      </button>

      {isOpen && (
        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">현재 비밀번호</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호"
              className="w-full py-2.5 px-3 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="새 비밀번호 (4자 이상)"
              className="w-full py-2.5 px-3 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">새 비밀번호 확인</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호 재입력"
              className="w-full py-2.5 px-3 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full py-2.5 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors text-sm disabled:opacity-50"
          >
            {loading ? '변경 중...' : '변경하기'}
          </button>
        </div>
      )}
    </div>
  )
}

function PrepaidList({ purchases, userId, onRefresh }: {
  purchases: PrepaidPurchase[]
  userId?: string
  onRefresh?: () => void
}) {
  async function handleCancelPending(purchaseId: string) {
    if (!confirm('선불권 신청을 취소하시겠습니까?\n(아직 입금하지 않은 경우에만 취소 가능합니다)')) return
    const res = await fetch('/api/prepaid/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_id: purchaseId }),
    })
    const data = await res.json()
    if (data.success) {
      alert('신청이 취소되었습니다.')
      onRefresh?.()
    } else {
      alert(data.error || '취소에 실패했습니다.')
    }
  }

  async function handleRefund(purchaseId: string, productName: string, usedHours: number, totalPaid: number) {
    const refundAmount = totalPaid - usedHours * 14000
    const msg = usedHours > 0
      ? `환불 시 사용한 시간(${usedHours}h)은 시간당 14,000원으로 계산됩니다.\n\n예상 환불 금액: ${refundAmount.toLocaleString()}원\n\n환불 신청하시겠습니까?`
      : `${productName} 전액(${totalPaid.toLocaleString()}원) 환불 신청하시겠습니까?`
    if (!confirm(msg)) return

    const res = await fetch('/api/prepaid/refund', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ purchase_id: purchaseId, user_id: userId }),
    })
    const data = await res.json()
    if (data.success) {
      alert(`환불 신청이 완료되었습니다.\n관리자 승인 후 ${refundAmount.toLocaleString()}원이 환불됩니다.`)
      onRefresh?.()
    } else {
      alert(data.error || '환불 신청에 실패했습니다.')
    }
  }

  if (purchases.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm p-10 text-center text-gray-400">
        선불권 내역이 없습니다.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {purchases.map((p) => {
        const statusInfo = PREPAID_STATUS_LABELS[p.status] ?? { label: p.status, className: 'bg-gray-100 text-gray-500' }
        const usedHours = p.total_hours - p.remaining_hours
        const usagePercent = p.total_hours > 0 ? (usedHours / p.total_hours) * 100 : 0

        return (
          <div key={p.id} className="bg-white rounded-2xl shadow-sm p-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="font-semibold text-gray-900">{p.product?.name ?? '선불권'}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  신청일 {new Date(p.created_at).toLocaleDateString('ko-KR')}
                </p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusInfo.className}`}>
                {statusInfo.label}
              </span>
            </div>

            {p.status === 'paid' && (
              <>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-500">잔여 시간</span>
                  <span className="font-bold text-blue-600">{p.remaining_hours} / {p.total_hours}시간</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${100 - usagePercent}%` }}
                  />
                </div>
                {userId && (
                  <button
                    onClick={() => handleRefund(p.id, p.product?.name ?? '선불권', usedHours, p.product?.price ?? 0)}
                    className="w-full mt-2 py-2 text-sm font-medium text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                  >
                    환불 신청
                  </button>
                )}
              </>
            )}

            {p.status === 'pending' && (
              <div className="space-y-2">
                <p className="text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">
                  입금 확인 대기 중입니다. 입금 후 관리자 확인 시 활성화됩니다.
                </p>
                <div className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-xs text-gray-500">입금 계좌</p>
                  <p className="text-xs text-gray-700">카카오뱅크 · 정상은</p>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-800">7979-72-56275</span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText('7979-72-56275')
                        alert('계좌번호가 복사되었습니다.')
                      }}
                      className="text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-100 active:bg-blue-200"
                    >
                      복사
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => handleCancelPending(p.id)}
                  className="w-full py-2 text-sm font-medium text-gray-500 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
                >
                  신청 취소
                </button>
              </div>
            )}

            {p.status === 'refund_requested' && (
              <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2">
                환불 신청 중입니다. 관리자 승인 후 환불됩니다.
              </p>
            )}

            {p.product && (
              <p className="text-xs text-gray-400 mt-2">
                결제금액 {p.product.price.toLocaleString()}원
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}
