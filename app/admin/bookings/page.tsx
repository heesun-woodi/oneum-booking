'use client'

import { useState, useEffect } from 'react'
import { getAdminBookings, cancelBookingAdmin } from '@/app/actions/admin-bookings'

interface Booking {
  id: string
  booking_date: string
  start_time: string
  end_time: string
  space: 'nolter' | 'soundroom'
  member_type: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
  amount: number
  status: string
  payment_status: string
  created_at: string
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  
  // 필터
  const [status, setStatus] = useState('')
  const [space, setSpace] = useState('')
  const [household, setHousehold] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  
  const loadBookings = async () => {
    setLoading(true)
    
    const result = await getAdminBookings({
      status: status || undefined,
      space: space || undefined,
      household: household || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 100,
    })
    
    if (result.success) {
      setBookings(result.bookings as Booking[])
      setTotal(result.total)
    }
    
    setLoading(false)
  }
  
  useEffect(() => {
    loadBookings()
  }, [status, space, household, startDate, endDate])
  
  const handleCancelBooking = async (bookingId: string, booking: Booking) => {
    const spaceName = booking.space === 'nolter' ? '놀터' : '방음실'
    if (!confirm(`${booking.booking_date} ${booking.start_time}~${booking.end_time} ${spaceName} 예약을 취소하시겠습니까?`)) return
    
    const reason = prompt('취소 사유를 입력해주세요 (선택)')
    
    const result = await cancelBookingAdmin(bookingId, reason || undefined)
    
    if (result.success) {
      alert('예약이 취소되었습니다.')
      loadBookings()
    } else {
      alert(`취소 실패: ${result.error}`)
    }
  }
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">확정</span>
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">대기</span>
      case 'cancelled':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">취소</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">{status}</span>
    }
  }
  
  const getSpaceName = (space: string) => {
    return space === 'nolter' ? '놀터' : '방음실'
  }
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  }
  
  const formatPhone = (phone: string) => {
    return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📅 예약 관리</h1>
        <p className="text-sm text-gray-500">총 {total}건</p>
      </div>
      
      {/* 필터 */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 필터</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">전체</option>
              <option value="confirmed">확정</option>
              <option value="pending">대기</option>
              <option value="cancelled">취소</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">공간</label>
            <select
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">전체</option>
              <option value="nolter">놀터</option>
              <option value="soundroom">방음실</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">세대</label>
            <input
              type="text"
              value={household}
              onChange={(e) => setHousehold(e.target.value)}
              placeholder="예: 101동 101호"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>
      </div>
      
      {/* 예약 리스트 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">로딩 중...</div>
        ) : bookings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">예약이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">예약일</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">공간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">세대</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(booking.booking_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {booking.start_time} ~ {booking.end_time}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {getSpaceName(booking.space)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {booking.name}
                      {booking.member_type === 'non-member' && (
                        <span className="ml-1 text-xs text-gray-500">(비회원)</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {booking.household || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatPhone(booking.phone)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {booking.amount > 0 ? `${booking.amount.toLocaleString()}원` : '무료'}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="px-4 py-3">
                      {booking.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancelBooking(booking.id, booking)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          취소
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
  )
}
