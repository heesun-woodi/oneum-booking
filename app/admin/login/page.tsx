'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function AdminLoginPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    
    try {
      const supabase = createClient()
      
      // 1. users 테이블에서 이름으로 사용자 조회
      const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('*')
        .eq('name', name)
        .eq('status', 'approved')
        .single()
      
      if (fetchError || !user) {
        setError('사용자를 찾을 수 없습니다.')
        setLoading(false)
        return
      }
      
      // 2. 관리자 권한 확인
      if (!user.is_admin) {
        setError('관리자 권한이 없습니다.')
        setLoading(false)
        return
      }
      
      // 3. 비밀번호 확인 (bcrypt 사용하지 않고 직접 비교 - 기존 users 테이블 구조)
      // 실제 환경에서는 bcrypt 사용 권장
      const bcrypt = await import('bcryptjs')
      const isValid = await bcrypt.compare(password, user.password_hash)
      
      if (!isValid) {
        setError('비밀번호가 올바르지 않습니다.')
        setLoading(false)
        return
      }
      
      // 4. 세션 저장
      const session = {
        id: user.id,
        household: user.household,
        name: user.name,
        phone: user.phone,
        isAdmin: true
      }
      
      localStorage.setItem('adminSession', JSON.stringify(session))
      console.log('✅ 관리자 로그인:', session)
      
      router.push('/admin')
    } catch (err) {
      console.error('Admin login error:', err)
      setError('로그인 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center text-gray-800">🏠 온음 관리자</h1>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="이름을 입력하세요"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              required
              disabled={loading}
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">비밀번호</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="비밀번호를 입력하세요"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              required
              disabled={loading}
            />
          </div>
          
          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
        
        <div className="mt-4 text-center text-sm text-gray-600">
          <p>회원 로그인 계정으로 관리자 접속</p>
        </div>
      </div>
    </div>
  )
}
