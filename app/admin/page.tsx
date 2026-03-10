'use client'

import { useEffect, useState } from 'react'
import { getAdminBookings, getTodayBookings } from '@/app/actions/admin-bookings'

interface Booking {
  id: string
  date: string
  times: string[]
  space: string
  household: string
  name: string
  phone: string
  status: string
  created_at: string
}

export default function AdminDashboard() {
  const [todayBookings, setTodayBookings] = useState<Booking[]>([])
  const [recentBookings, setRecentBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    loadData()
  }, [])
  
  const loadData = async () => {
    const [today, recent] = await Promise.all([
      getTodayBookings(),
      getAdminBookings({ limit: 50 })
    ])
    
    setTodayBookings(today.bookings || [])
    setRecentBookings(recent.bookings || [])
    setLoading(false)
  }
  
  if (loading) {
    return <div>Loading...</div>
  }
  
  const nolterCount = todayBookings.filter(b => b.space === 'outdoor').length
  const soundroomCount = todayBookings.filter(b => b.space === 'soundroom').length
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">대시보드</h1>
      
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">오늘 예약</div>
          <div className="text-3xl font-bold text-blue-600 mt-2">{todayBookings.length}건</div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">🏠 놀터 예약</div>
          <div className="text-3xl font-bold text-green-600 mt-2">{nolterCount}건</div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="text-sm text-gray-600">🎵 방음실 예약</div>
          <div className="text-3xl font-bold text-purple-600 mt-2">{soundroomCount}건</div>
        </div>
      </div>
      
      {/* 오늘 예약 현황 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">오늘 예약 현황</h2>
        </div>
        <div className="p-6">
          {todayBookings.length === 0 ? (
            <p className="text-gray-500 text-center py-8">오늘 예약이 없습니다.</p>
          ) : (
            <div className="space-y-3">
              {todayBookings.map((booking) => (
                <div key={booking.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center space-x-4">
                    <span className="text-2xl">
                      {booking.space === 'outdoor' ? '🏠' : '🎵'}
                    </span>
                    <div>
                      <div className="font-medium text-gray-800">
                        {booking.times.join(', ')} | {booking.household}호 {booking.name}
                      </div>
                      <div className="text-sm text-gray-500">{booking.phone}</div>
                    </div>
                  </div>
                  <span className="px-3 py-1 text-xs rounded-full bg-green-100 text-green-800">
                    확정
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* 최근 예약 리스트 */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">최근 예약 (50건)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">날짜</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">시간</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">공간</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">세대</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">예약자</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">전화번호</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">상태</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {recentBookings.map((booking) => (
                <tr key={booking.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-sm text-gray-800">{booking.date}</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{booking.times.join(', ')}</td>
                  <td className="px-4 py-3 text-sm">
                    {booking.space === 'outdoor' ? '🏠 놀터' : '🎵 방음실'}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-800">{booking.household}호</td>
                  <td className="px-4 py-3 text-sm text-gray-800">{booking.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{booking.phone}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
                      {booking.status === 'confirmed' ? '확정' : booking.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
