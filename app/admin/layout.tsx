'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

interface AdminSession {
  id: string
  email: string
  name: string
  role: string
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    // 로그인 페이지는 인증 체크 제외
    if (pathname === '/admin/login') {
      setLoading(false)
      return
    }
    
    // 인증 체크
    const session = localStorage.getItem('adminSession')
    if (!session) {
      router.push('/admin/login')
      return
    }
    
    setAdmin(JSON.parse(session))
    setLoading(false)
  }, [pathname, router])
  
  const handleLogout = () => {
    localStorage.removeItem('adminSession')
    router.push('/admin/login')
  }
  
  // 로그인 페이지는 레이아웃 없이 표시
  if (pathname === '/admin/login') {
    return <>{children}</>
  }
  
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading...</p>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen bg-gray-100">
      {/* 상단 네비게이션 */}
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-8">
              <Link href="/admin" className="text-xl font-bold text-gray-800">
                🏠 온음 관리자
              </Link>
              
              <div className="hidden md:flex space-x-4">
                <Link
                  href="/admin"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📊 대시보드
                </Link>
                <Link
                  href="/admin/users"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/users'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  👥 가입 신청
                </Link>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{admin?.name}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                로그아웃
              </button>
            </div>
          </div>
        </div>
      </nav>
      
      {/* 메인 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
