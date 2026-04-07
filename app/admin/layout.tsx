'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'

interface AdminSession {
  id: string
  household?: string
  name: string
  phone?: string
  isAdmin: boolean
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [admin, setAdmin] = useState<AdminSession | null>(null)
  const [loading, setLoading] = useState(true)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  
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
    
    const adminData = JSON.parse(session)
    
    // 관리자 권한 확인
    if (!adminData.isAdmin) {
      alert('관리자 권한이 없습니다.')
      localStorage.removeItem('adminSession')
      router.push('/admin/login')
      return
    }
    
    setAdmin(adminData)
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
              
              {/* 데스크톱 메뉴 */}
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
                <Link
                  href="/admin/payments"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/payments'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  💰 일반예약
                </Link>
                <Link
                  href="/admin/prepaid"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/prepaid'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  🎟️ 선불권
                </Link>
                <Link
                  href="/admin/bookings"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/bookings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📅 예약 관리
                </Link>
                <Link
                  href="/admin/stats"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/stats'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📈 통계
                </Link>
                <Link
                  href="/admin/notifications"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/notifications'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📨 알림
                </Link>
                <Link
                  href="/admin/templates"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname?.startsWith('/admin/templates')
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📝 템플릿
                </Link>
                <Link
                  href="/admin/inquiry"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/inquiry'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  💬 문의
                </Link>
                <Link
                  href="/admin/settings"
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pathname === '/admin/settings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  ⚙️ 설정
                </Link>
              </div>
            </div>
            
            {/* 우측: 관리자 정보 + 햄버거 버튼 */}
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-700">{admin?.name}</span>
              <button
                onClick={handleLogout}
                className="hidden md:block text-sm text-gray-600 hover:text-gray-900"
              >
                로그아웃
              </button>
              
              {/* 햄버거 버튼 (모바일) */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md text-gray-700 hover:bg-gray-100"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {mobileMenuOpen ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                  )}
                </svg>
              </button>
            </div>
          </div>
          
          {/* 모바일 메뉴 */}
          {mobileMenuOpen && (
            <div className="md:hidden border-t border-gray-200 bg-white">
              <div className="px-2 pt-2 pb-3 space-y-1">
                <Link
                  href="/admin"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📊 대시보드
                </Link>
                <Link
                  href="/admin/users"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/users'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  👥 가입 신청
                </Link>
                <Link
                  href="/admin/payments"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/payments'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  💰 일반예약
                </Link>
                <Link
                  href="/admin/prepaid"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/prepaid'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  🎟️ 선불권
                </Link>
                <Link
                  href="/admin/bookings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/bookings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📅 예약 관리
                </Link>
                <Link
                  href="/admin/stats"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/stats'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📈 통계
                </Link>
                <Link
                  href="/admin/notifications"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/notifications'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📨 알림
                </Link>
                <Link
                  href="/admin/templates"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname?.startsWith('/admin/templates')
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  📝 템플릿
                </Link>
                <Link
                  href="/admin/inquiry"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/inquiry'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  💬 문의
                </Link>
                <Link
                  href="/admin/settings"
                  onClick={() => setMobileMenuOpen(false)}
                  className={`block px-3 py-2 rounded-md text-base font-medium ${
                    pathname === '/admin/settings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  ⚙️ 설정
                </Link>
                <button
                  onClick={handleLogout}
                  className="block w-full text-left px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:bg-gray-100"
                >
                  로그아웃
                </button>
              </div>
            </div>
          )}
        </div>
      </nav>
      
      {/* 메인 컨텐츠 */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  )
}
