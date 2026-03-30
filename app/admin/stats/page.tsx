'use client'

import { useState, useEffect } from 'react'
import {
  getMonthlyBookingStats,
  getHouseholdUsageStats,
  getSpaceTimeStats,
  getCancellationStats,
} from '@/app/actions/admin-stats'

export default function AdminStatsPage() {
  const [loading, setLoading] = useState(true)
  
  // 월별 통계
  const [monthlyStats, setMonthlyStats] = useState<any>(null)
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  
  // 세대별 이용
  const [householdStats, setHouseholdStats] = useState<any[]>([])
  
  // 공간별 시간대
  const [spaceTimeStats, setSpaceTimeStats] = useState<any[]>([])
  const [selectedSpace, setSelectedSpace] = useState<'nolter' | 'soundroom'>('nolter')
  
  // 취소율
  const [cancellationStats, setCancellationStats] = useState<any[]>([])
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear())
  
  useEffect(() => {
    loadAllStats()
  }, [selectedMonth, selectedSpace, selectedYear])
  
  const loadAllStats = async () => {
    setLoading(true)
    
    const [year, month] = selectedMonth.split('-').map(Number)
    
    // 월별 통계
    const monthlyResult = await getMonthlyBookingStats(year, month)
    if (monthlyResult.success) {
      setMonthlyStats(monthlyResult.stats)
    }
    
    // 세대별 이용
    const householdResult = await getHouseholdUsageStats(selectedMonth)
    if (householdResult.success) {
      setHouseholdStats(householdResult.households)
    }
    
    // 공간별 시간대
    const timeResult = await getSpaceTimeStats(selectedSpace, selectedMonth)
    if (timeResult.success) {
      setSpaceTimeStats(timeResult.timeStats)
    }
    
    // 취소율
    const cancellationResult = await getCancellationStats(selectedYear)
    if (cancellationResult.success) {
      setCancellationStats(cancellationResult.cancellationStats)
    }
    
    setLoading(false)
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">📊 통계/리포트</h1>
      
      {/* 월별 예약 통계 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📊 월별 예약 통계</h2>
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        
        {monthlyStats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-xs text-blue-600 mb-1">총 예약</p>
              <p className="text-2xl font-bold text-blue-700">{monthlyStats.total}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-xs text-green-600 mb-1">확정</p>
              <p className="text-2xl font-bold text-green-700">{monthlyStats.confirmed}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-xs text-yellow-600 mb-1">대기</p>
              <p className="text-2xl font-bold text-yellow-700">{monthlyStats.pending}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-xs text-red-600 mb-1">취소</p>
              <p className="text-2xl font-bold text-red-700">{monthlyStats.cancelled}</p>
            </div>
            
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-xs text-purple-600 mb-1">놀터</p>
              <p className="text-2xl font-bold text-purple-700">{monthlyStats.nolter}</p>
            </div>
            <div className="bg-pink-50 p-4 rounded-lg">
              <p className="text-xs text-pink-600 mb-1">방음실</p>
              <p className="text-2xl font-bold text-pink-700">{monthlyStats.soundroom}</p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-lg">
              <p className="text-xs text-indigo-600 mb-1">회원</p>
              <p className="text-2xl font-bold text-indigo-700">{monthlyStats.member}</p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">취소율</p>
              <p className="text-2xl font-bold text-gray-700">{monthlyStats.cancellationRate}%</p>
            </div>
          </div>
        )}
      </div>
      
      {/* 세대별 이용 현황 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🏠 세대별 이용 현황</h2>
        
        {householdStats.length === 0 ? (
          <p className="text-gray-500 text-center py-4">데이터가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">순위</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">세대</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">놀터</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">방음실</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">총 이용</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {householdStats.map((stat, index) => (
                  <tr key={stat.household}>
                    <td className="px-4 py-3 text-sm text-gray-900">{index + 1}</td>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{stat.household}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{stat.nolter}회</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{stat.soundroom}회</td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-900">{stat.total}회</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* 공간별 인기 시간대 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📍 공간별 인기 시간대</h2>
          <select
            value={selectedSpace}
            onChange={(e) => setSelectedSpace(e.target.value as 'nolter' | 'soundroom')}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          >
            <option value="nolter">놀터</option>
            <option value="soundroom">방음실</option>
          </select>
        </div>
        
        {spaceTimeStats.length === 0 ? (
          <p className="text-gray-500 text-center py-4">데이터가 없습니다.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {spaceTimeStats.map((stat) => (
              <div
                key={stat.time}
                className="bg-gray-50 p-3 rounded-lg text-center"
              >
                <p className="text-sm font-medium text-gray-700">{stat.time}</p>
                <p className="text-xl font-bold text-blue-600">{stat.count}</p>
                <p className="text-xs text-gray-500">예약</p>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* 취소율 분석 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">📉 월별 취소율 분석</h2>
          <input
            type="number"
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm w-24"
          />
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {cancellationStats.map((stat) => (
            <div key={stat.month} className="bg-gray-50 p-3 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">{stat.month}월</p>
              <p className="text-sm text-gray-700">
                {stat.cancelled}/{stat.total}
              </p>
              <p className={`text-lg font-bold ${
                parseFloat(stat.rate) > 20 ? 'text-red-600' : 
                parseFloat(stat.rate) > 10 ? 'text-yellow-600' : 
                'text-green-600'
              }`}>
                {stat.rate}%
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
