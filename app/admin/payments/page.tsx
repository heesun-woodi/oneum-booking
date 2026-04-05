'use client'

import { useEffect, useState } from 'react'
import { getAllBookingsForPayment, confirmPayment } from '@/app/actions/payments'
import { getAllPrepaidPurchases, confirmPrepaidPayment } from '@/app/actions/admin-prepaid'
import { maskPhone } from '@/lib/notifications/templates'

type PaymentFilter = 'all' | 'pending' | 'completed'

interface Booking {
  id: string
  booking_date: string
  space: string
  name: string
  phone: string
  amount: number
  payment_status: string
  created_at: string
}

export default function PaymentsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [prepaidPurchases, setPrepaidPurchases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PaymentFilter>('pending')
  const [dateRange, setDateRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  })

  useEffect(() => {
    loadBookings()
    loadPrepaidPurchases()
  }, [dateRange])

  async function loadBookings() {
    setLoading(true)
    const result = await getAllBookingsForPayment({
      startDate: dateRange.startDate,
      endDate: dateRange.endDate,
    })

    if (result.success) {
      setBookings(result.bookings)
    }
    setLoading(false)
  }

  async function loadPrepaidPurchases() {
    const result = await getAllPrepaidPurchases()
    if (result.success) {
      setPrepaidPurchases(result.purchases.filter(p => p.status === 'pending'))
    }
  }

  async function handleConfirmPayment(bookingId: string, bookingName?: string, bookingAmount?: number) {
    if (!confirm(`${bookingName || ''}님의 ${(bookingAmount ?? 0).toLocaleString()}원 입금을 확인하시겠습니까?`)) return

    const result = await confirmPayment(bookingId)

    if (result.success) {
      alert('입금이 확인되었습니다.')
      loadBookings()
    } else {
      alert('오류: ' + result.error)
    }
  }

  async function handleConfirmPrepaidPayment(purchaseId: string, userName: string, productName?: string, amount?: number) {
    if (!confirm(`${userName}님의 ${productName || '선불권'}(${(amount ?? 0).toLocaleString()}원) 입금을 확인하시겠습니까?`)) return
    const result = await confirmPrepaidPayment(purchaseId)
    if (result.success) {
      alert('선불권 입금이 확인되었습니다. 선불권이 활성화됩니다.')
      loadPrepaidPurchases()
    } else {
      alert('오류: ' + result.error)
    }
  }

  const filteredBookings = bookings.filter((b) => {
    if (filter === 'all') return true
    if (filter === 'pending') return b.payment_status === 'pending'
    if (filter === 'completed') return b.payment_status === 'completed'
    return true
  })

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">입금 관리</h1>
          <p className="mt-2 text-gray-600">비회원 예약의 입금 상태를 관리합니다.</p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex items-center gap-4 flex-wrap">
            {/* Tab Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => setFilter('pending')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'pending'
                    ? 'bg-red-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                미입금 ({bookings.filter(b => b.payment_status === 'pending').length})
              </button>
              <button
                onClick={() => setFilter('completed')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'completed'
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                입금완료 ({bookings.filter(b => b.payment_status === 'completed').length})
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  filter === 'all'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                전체 ({bookings.length})
              </button>
            </div>

            {/* Date Range */}
            <div className="flex items-center gap-2 ml-auto">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
              <span className="text-gray-500">~</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>

            {/* Refresh */}
            <button
              onClick={loadBookings}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
            >
              🔄 새로고침
            </button>
          </div>
        </div>

        {/* 선불권 입금 대기 - 미입금/전체 탭에서만 표시 */}
        {prepaidPurchases.length > 0 && filter !== 'completed' && (
          <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
            <div className="px-6 py-4 border-b border-gray-200 bg-yellow-50">
              <h2 className="text-lg font-semibold text-yellow-800">
                🎟️ 선불권 입금 대기 ({prepaidPurchases.length}건)
              </h2>
              <p className="text-sm text-yellow-600 mt-1">선불권 구매 신청 후 입금 대기 중인 항목입니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">세대</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상품</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">입금확인</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {prepaidPurchases.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(p.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{p.user?.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.user?.household}호</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {p.product?.name} ({p.product?.hours}시간)
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {(p.product?.price ?? 0).toLocaleString()}원
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        <button
                          onClick={() => handleConfirmPrepaidPayment(p.id, p.user?.name, p.product?.name, p.product?.price)}
                          className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200 transition-colors cursor-pointer"
                        >
                          ☐ 입금확인
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : filteredBookings.length === 0 ? (
            <div className="p-12 text-center text-gray-500">예약이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      예약일
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      공간
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      이름
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      전화번호
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      금액
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                      입금상태
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {new Date(booking.booking_date).toLocaleDateString('ko-KR')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {booking.space === 'nolter' ? '놀터' : '방음실'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {booking.name}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {maskPhone(booking.phone)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {booking.amount.toLocaleString()}원
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-center">
                        {booking.payment_status === 'completed' ? (
                          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                            ✓ 입금완료
                          </span>
                        ) : (
                          <button
                            onClick={() => handleConfirmPayment(booking.id, booking.name, booking.amount)}
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 hover:bg-red-200 transition-colors cursor-pointer"
                          >
                            ☐ 입금확인
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
