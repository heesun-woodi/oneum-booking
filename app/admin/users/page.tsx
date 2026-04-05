'use client'

import { useEffect, useState } from 'react'
import { getSignupRequests, approveSignup, rejectSignup, setAdminRole, updateUser, deleteUser, resetPassword } from '@/app/actions/admin-users'

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
  is_admin?: boolean
}

interface EditingUser {
  id: string
  name: string
  phone: string
}

export default function AdminUsersPage() {
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending')
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [admin, setAdmin] = useState<any>(null)
  const [editingUser, setEditingUser] = useState<EditingUser | null>(null)
  
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
    if (reason === null) return
    
    const result = await rejectSignup(userId, admin.id, reason)
    if (result.success) {
      alert('거부되었습니다.')
      loadUsers()
    } else {
      alert(result.error || '거부 실패')
    }
  }
  
  const handleAdminToggle = async (userId: string, currentIsAdmin: boolean, userName: string) => {
    const action = currentIsAdmin ? '해제' : '부여'
    if (!confirm(`${userName}님의 관리자 권한을 ${action}하시겠습니까?`)) return
    
    const result = await setAdminRole(userId, !currentIsAdmin)
    if (result.success) {
      alert(result.message)
      loadUsers()
    } else {
      alert(result.error || '권한 설정 실패')
    }
  }
  
  const handleEdit = (user: User) => {
    setEditingUser({
      id: user.id,
      name: user.name,
      phone: user.phone
    })
  }
  
  const handleCancelEdit = () => {
    setEditingUser(null)
  }
  
  const handleSaveEdit = async () => {
    if (!editingUser) return
    
    const result = await updateUser(editingUser.id, {
      name: editingUser.name,
      phone: editingUser.phone
    })
    
    if (result.success) {
      alert(result.message)
      setEditingUser(null)
      loadUsers()
    } else {
      alert(result.error || '수정 실패')
    }
  }
  
  const handleDelete = async (userId: string, userName: string) => {
    if (!admin) {
      alert('관리자 로그인이 필요합니다.')
      window.location.href = '/admin/login'
      return
    }
    
    if (!confirm(`정말 ${userName}님을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.`)) return
    
    const result = await deleteUser(userId, admin.id)
    if (result.success) {
      alert(result.message)
      loadUsers()
    } else {
      alert(result.error || '삭제 실패')
    }
  }
  
  const handleResetPassword = async (userId: string, userName: string) => {
    const newPassword = prompt(`${userName}님의 새 비밀번호를 입력하세요 (최소 4자):`)
    if (!newPassword) return
    
    const result = await resetPassword(userId, newPassword)
    if (result.success) {
      alert(result.message + '\n새 비밀번호: ' + newPassword)
    } else {
      alert(result.error || '비밀번호 재설정 실패')
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
                  {activeTab === 'approved' && (
                    <>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-700 uppercase">관리자</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">액션</th>
                    </>
                  )}
                  {activeTab === 'rejected' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">거부 사유</th>
                  )}
                  {activeTab === 'pending' && (
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-700 uppercase">액션</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {users.map((user) => {
                  const isEditing = editingUser?.id === user.id
                  
                  return (
                    <tr key={user.id} className={isEditing ? 'bg-blue-50' : 'hover:bg-gray-50'}>
                      <td className="px-4 py-3 text-sm text-gray-800">{user.household}호</td>
                      <td className="px-4 py-3 text-sm text-gray-800">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingUser.name}
                            onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                            className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          user.name
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingUser.phone}
                            onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                            placeholder="010-XXXX-XXXX"
                            className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          user.phone
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(user.created_at).toLocaleDateString('ko-KR')}
                      </td>
                      {activeTab === 'approved' && (
                        <>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="checkbox"
                              checked={user.is_admin || false}
                              onChange={() => handleAdminToggle(user.id, user.is_admin || false, user.name)}
                              disabled={isEditing}
                              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer disabled:opacity-50"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {isEditing ? (
                              <div className="flex space-x-2">
                                <button
                                  onClick={handleSaveEdit}
                                  className="px-3 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                  저장
                                </button>
                                <button
                                  onClick={handleCancelEdit}
                                  className="px-3 py-1 text-xs bg-gray-500 text-white rounded hover:bg-gray-600"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => handleEdit(user)}
                                  className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                  수정
                                </button>
                                <button
                                  onClick={() => handleResetPassword(user.id, user.name)}
                                  className="px-3 py-1 text-xs bg-yellow-600 text-white rounded hover:bg-yellow-700"
                                  title="비밀번호 재설정"
                                >
                                  🔑
                                </button>
                                <button
                                  onClick={() => handleDelete(user.id, user.name)}
                                  className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700"
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </>
                      )}
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
