'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { getBookingsByHousehold, getPastBookingsByHousehold } from '@/app/actions/bookings'

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

const BOOKING_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '입금대기', className: 'bg-yellow-100 text-yellow-700' },
  confirmed: { label: '확정', className: 'bg-green-100 text-green-700' },
  completed: { label: '이용완료', className: 'bg-blue-100 text-blue-700' },
  cancelled: { label: '취소', className: 'bg-gray-100 text-gray-500' },
}

const PREPAID_STATUS_LABEL: Record<string, { label: string; className: string }> = {
  pending: { label: '입금대기', className: 'bg-yellow-100 text-yellow-700' },
  paid: { label: '사용중', className: 'bg-green-100 text-green-700' },
  refund_requested: { label: '환불신청', className: 'bg-orange-100 text-orange-700' },
  refunded: { label: '환불완료', className: 'bg-gray-100 text-gray-500' },
  cancelled: { label: '자동취소', className: 'bg-red-100 text-red-600' },
}

type Tab = 'upcoming' | 'past' | 'prepaid'

export default function MyPage() {
  const router = useRouter()
  const [session, setSession] = useState<UserSession | null>(null)
  const [tab, setTab] = useState<Tab>('upcoming')
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([])
  const [pastBookings, setPastBookings] = useState<Booking[]>([])
  const [prepaidPurchases, setPrepaidPurchases] = useState<PrepaidPurchase[]>([])
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
  }, [session])

  async function loadAll(s: UserSession) {
    setLoading(true)
    await Promise.all([
      loadBookings(s.household),
      s.userId ? loadPrepaid(s.userId) : Promise.resolve(),
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

  async function loadPrepaid(userId: string) {
    const res = await fetch(`/api/prepaid/my-purchases?user_id=${userId}`)
    const json = await res.json()
    if (json.success) setPrepaidPurchases(json.purchases)
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
              <p className="text-xl font-bold text-gray-900">{session.household}호</p>
              <p className="text-gray-600">{session.name}</p>
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
          <PrepaidList purchases={prepaidPurchases} />
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
        const statusInfo = BOOKING_STATUS_LABEL[b.status] ?? { label: b.status, className: 'bg-gray-100 text-gray-500' }
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

function PrepaidList({ purchases }: { purchases: PrepaidPurchase[] }) {
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
        const statusInfo = PREPAID_STATUS_LABEL[p.status] ?? { label: p.status, className: 'bg-gray-100 text-gray-500' }
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
                {p.expires_at && (
                  <p className="text-xs text-gray-400">
                    만료일 {new Date(p.expires_at).toLocaleDateString('ko-KR')}
                  </p>
                )}
              </>
            )}

            {p.status === 'pending' && (
              <p className="text-xs text-yellow-600 bg-yellow-50 rounded-lg px-3 py-2">
                입금 확인 대기 중입니다. 입금 후 관리자 확인 시 활성화됩니다.
              </p>
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
