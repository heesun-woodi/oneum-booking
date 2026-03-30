'use client'

import { useState, useEffect } from 'react'
import { getNotificationLogs, getNotificationStats } from '@/app/actions/admin-notifications'

interface NotificationLog {
  id: string
  message_type: string
  recipient_phone: string
  recipient_name: string
  status: string
  error_message?: string
  sent_at?: string
  created_at: string
}

export default function AdminNotificationsPage() {
  const [logs, setLogs] = useState<NotificationLog[]>([])
  const [stats, setStats] = useState<any>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  
  // 필터
  const [messageType, setMessageType] = useState('')
  const [status, setStatus] = useState('')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })
  
  useEffect(() => {
    loadData()
  }, [messageType, status, selectedMonth])
  
  const loadData = async () => {
    setLoading(true)
    
    // 로그 조회
    const logsResult = await getNotificationLogs({
      messageType: messageType || undefined,
      status: status || undefined,
      limit: 100,
    })
    
    if (logsResult.success) {
      setLogs(logsResult.logs as NotificationLog[])
      setTotal(logsResult.total)
    }
    
    // 통계 조회
    const statsResult = await getNotificationStats(selectedMonth)
    if (statsResult.success) {
      setStats(statsResult.stats)
    }
    
    setLoading(false)
  }
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sent':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">발송완료</span>
      case 'failed':
        return <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">발송실패</span>
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">대기중</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">{status}</span>
    }
  }
  
  const getMessageTypeName = (type: string) => {
    const typeMap: Record<string, string> = {
      '1-1': '가입승인',
      '1-2': '가입거절',
      '2-1': '회원 예약완료',
      '2-2': '비회원 예약완료',
      '2-3': '예약취소',
      '3-1': '입금확인',
      '3-2': '입금거절',
      '4-1': '이용 리마인더',
      '4-2': '월간 이용한도',
      '5-1': '재무-입금내역',
      '5-2': '재무-미입금',
      '5-3': '재무-환불안내',
    }
    return typeMap[type] || type
  }
  
  const formatPhone = (phone: string) => {
    return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
  }
  
  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('ko-KR', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
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
      <h1 className="text-2xl font-bold text-gray-900">📨 알림 관리</h1>
      
      {/* 통계 */}
      {stats && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">📊 발송 통계</h2>
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-xs text-blue-600 mb-1">총 발송</p>
              <p className="text-2xl font-bold text-blue-700">{stats.total}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-xs text-green-600 mb-1">성공</p>
              <p className="text-2xl font-bold text-green-700">{stats.sent}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-xs text-red-600 mb-1">실패</p>
              <p className="text-2xl font-bold text-red-700">{stats.failed}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg">
              <p className="text-xs text-yellow-600 mb-1">대기</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-xs text-purple-600 mb-1">성공률</p>
              <p className="text-2xl font-bold text-purple-700">{stats.successRate}%</p>
            </div>
          </div>
          
          {/* 메시지 타입별 통계 */}
          {stats.typeStats.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">메시지 타입별 발송 (성공)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {stats.typeStats.map((typeStat: any) => (
                  <div key={typeStat.type} className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">{getMessageTypeName(typeStat.type)}</p>
                    <p className="text-xl font-bold text-gray-700">{typeStat.count}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* 필터 */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 필터</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">메시지 타입</label>
            <select
              value={messageType}
              onChange={(e) => setMessageType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">전체</option>
              <option value="1-1">가입승인</option>
              <option value="1-2">가입거절</option>
              <option value="2-1">회원 예약완료</option>
              <option value="2-2">비회원 예약완료</option>
              <option value="2-3">예약취소</option>
              <option value="3-1">입금확인</option>
              <option value="3-2">입금거절</option>
              <option value="4-1">이용 리마인더</option>
              <option value="4-2">월간 이용한도</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">전체</option>
              <option value="sent">발송완료</option>
              <option value="failed">발송실패</option>
              <option value="pending">대기중</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* 발송 이력 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">발송 이력 (총 {total}건)</h2>
        </div>
        
        {logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">발송 이력이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">발송일시</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">타입</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">수신자</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">오류</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDateTime(log.sent_at || log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {getMessageTypeName(log.message_type)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {log.recipient_name || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatPhone(log.recipient_phone)}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(log.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-red-600">
                      {log.error_message ? (
                        <span className="truncate block max-w-xs" title={log.error_message}>
                          {log.error_message}
                        </span>
                      ) : (
                        '-'
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
