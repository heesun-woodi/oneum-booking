'use client'

import { useEffect, useState } from 'react'
import { getSignupRequests, approveSignup, rejectSignup } from '@/app/actions/admin-users'

interface User {
  id: string
  household: string
  name: string
  phone: string
  status: string
  created_at: string
  approved_at?: string
  rejected_at?: string
  rejected_reason?: string
}

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState<any>(null)
  
  useEffect(() => {
    const session = localStorage.getItem('adminSession')
    if (session) {
      setAdmin(JSON.parse(session))
    }
  }, [])
  
  useEffect(() => {
    loadUsers()
  }, [activeTab])
  
  const loadUsers = async () => {
    setLoading(true)
    const result = await getSignupRequests(activeTab)
    setUsers(result.users || [])
    setLoading(false)
  }
  
  const handleApprove = async (userId: string) => {
    if (!admin) {
      alert('관리자 로그인이 필요합니다.')
      window.location.href = '/admin/login'
      return
    }
    if (!confirm('이 사용자를 승인하시겠습니까?')) return
    
    const result = await approveSignup(userId, admin.id)
    if (result.success) {
      alert('승인되었습니다.')
      loadUsers()
    } else {
      alert(result.error || '승인 실패')
    }
  }
  
  const handleReject = async (userId: string) => {
    if (!admin) {
      alert('관리자 로그인이 필요합니다.')
      window.location.href = '/admin/login'
      return
    }
    const reason = prompt('거부 사유를 입력하세요:')
    if (!reason) return
    
    const result = await rejectSignup(userId, admin.id, reason)
    if (result.success) {
      alert('거부되었습니다.')
      loadUsers()
    } else {
      alert(result.error || '거부 실패')
    }
  }
  
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-800">가입 신청 관리</h1>
      
      {/* 탭 */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pending')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'pending'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ⏳ 가입 대기
          </button>
          <button
            onClick={() => setActiveTab('approved')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'approved'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ✅ 승인됨
          </button>
          <button
            onClick={() => setActiveTab('rejected')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'rejected'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            ❌ 거부됨
          </button>
        </nav>
      </div>
      
      {/* 사용자 리스트 */}
      <div className="bg-white rounded-lg shadow">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {activeTab === 'pending' && '대기 중인 가입 신청이 없습니다.'}
            {activeTab === 'approved' && '승인된 사용자가 없습니다.'}
            {activeTab === 'rejected' && '거부된 신청이 없습니다.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">세대</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">전화번호</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">신청일</th>
                  {activeTab === 'rejected' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">거부 사유</th>
                  )}
                  {activeTab === 'pending' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">액션</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-800">{user.household}호</td>
                    <td className="px-4 py-3 text-sm text-gray-800">{user.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{user.phone}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(user.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    {activeTab === 'rejected' && (
                      <td className="px-4 py-3 text-sm text-gray-600">{user.rejected_reason}</td>
                    )}
                    {activeTab === 'pending' && (
                      <td className="px-4 py-3 text-sm">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApprove(user.id)}
                            className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                          >
                            승인
                          </button>
                          <button
                            onClick={() => handleReject(user.id)}
                            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                          >
                            거부
                          </button>
                        </div>
                      </td>
                    )}
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
