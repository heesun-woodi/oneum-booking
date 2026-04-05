// 🔄 v1.0.4 - 구조화된 공간 정보 & 이용 규칙
'use client'

import { useState, useEffect } from 'react'
import { createBooking, getBookings, getBookingsByPhone, getBookingsByHousehold, cancelBooking, CreateBookingInput } from './actions/bookings'
import { signup, login, resetPassword } from './actions/auth'
import { getSpacesInfo, getGeneralRulesFromDB, SpacesInfo, GeneralRules } from './actions/structured-settings'
import { getMyPrepaidPurchases, PrepaidPurchase as PrepaidPurchaseType } from './actions/prepaid'
import { getTotalRemainingHours, calculatePrepaidUsage } from '@/lib/prepaid-utils'
import { SpaceGallery } from './components/space-gallery/SpaceGallery'
import { PrepaidPurchaseModal } from './components/PrepaidPurchaseModal'
import { PrepaidCard } from './components/PrepaidCard'

// ===== 타입 정의 =====
type PrepaidPurchase = PrepaidPurchaseType // actions/prepaid.ts에서 import한 타입 사용

interface UserSession {
  isLoggedIn: boolean
  household: string // '201', '301', etc.
  name: string
  phone: string
  isAdmin?: boolean
  userId?: string // Phase 6.3: 선불권 구매를 위한 user_id
}

type SpaceType = 'nolter' | 'soundroom'

interface Booking {
  id: string
  booking_date: string
  start_time: string
  end_time: string
  space: string
  member_type: string
  household?: string
  name: string
  phone: string
  status: string
  amount: number
}

export default function Home() {
  // ⭐ VERSION MARKER
  console.log('🚀 [PAGE LOAD v1.0.5] 온음 예약 시스템 로드됨')
  console.log('🚀 [VERSION] Login Debug Enhanced - 2025-04-02')
  
  // ===== State 관리 =====
  
  // 사용자 세션 (localStorage에서 로드)
  const [userSession, setUserSession] = useState<UserSession>({
    isLoggedIn: false,
    household: '',
    name: '',
    phone: ''
  })
  
  // 예약 데이터
  const [bookingsData, setBookingsData] = useState<Booking[]>([])
  
  // 공간 정보 & 이용 규칙 (DB에서 로드)
  const [spacesInfo, setSpacesInfo] = useState<SpacesInfo | null>(null)
  const [generalRules, setGeneralRules] = useState<GeneralRules | null>(null)
  
  // 모달 상태
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [isPrepaidModalOpen, setIsPrepaidModalOpen] = useState(false) // Phase 6.3: 선불권 구매 모달
  // 예약 관리 모달 상태
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [managePhone, setManagePhone] = useState('')
  const [myBookings, setMyBookings] = useState<Booking[]>([])
  const [isLoadingBookings, setIsLoadingBookings] = useState(false)
  
  // Phase 6.4: 선불권 상태
  const [prepaidPurchases, setPrepaidPurchases] = useState<PrepaidPurchase[]>([])
  const [isLoadingPrepaid, setIsLoadingPrepaid] = useState(false)
  
  // 달력 & 예약
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [selectedSpace, setSelectedSpace] = useState<SpaceType>('nolter')
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]) // 연속 시간 다중 선택
  
  // 예약 폼
  const [name, setName] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [bookedTimes, setBookedTimes] = useState<string[]>([]) // 선택된 날짜의 예약된 시간들
  
  // 인증 폼
  const [authHousehold, setAuthHousehold] = useState<string>('')
  const [authName, setAuthName] = useState<string>('')
  const [authPhone, setAuthPhone] = useState<string>('')
  const [authPassword, setAuthPassword] = useState<string>('')
  const [authIsResident, setAuthIsResident] = useState<boolean>(false) // Phase 6.1: 세대원 여부

  // ===== localStorage 세션 관리 =====
  
  useEffect(() => {
    // 페이지 로드 시 세션 복원
    const savedSession = localStorage.getItem('oneumSession')
    if (savedSession) {
      const session = JSON.parse(savedSession)
      setUserSession(session)
      console.log('✅ 세션 복원:', session)
    }
  }, [])

  // ===== 예약 데이터 로드 (DB에서) =====
  
  useEffect(() => {
    loadBookings()
  }, [currentMonth, selectedSpace])

  useEffect(() => {
    async function loadSettingsData() {
      const [spacesResult, rulesResult] = await Promise.all([
        getSpacesInfo(),
        getGeneralRulesFromDB()
      ])
      
      if (spacesResult.success && spacesResult.data) {
        setSpacesInfo(spacesResult.data)
      }
      
      if (rulesResult.success && rulesResult.data) {
        setGeneralRules(rulesResult.data)
      }
    }
    loadSettingsData()
  }, [])

  // Phase 6.4: 선불권 조회 (로그인 시)
  useEffect(() => {
    if (userSession.isLoggedIn && userSession.userId) {
      loadPrepaidPurchases()
    } else {
      setPrepaidPurchases([])
    }
  }, [userSession.isLoggedIn, userSession.userId])

  async function loadBookings() {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    console.log('📥 예약 데이터 로드 중...')
    const result = await getBookings(year, month, selectedSpace)
    if (result.success) {
      setBookingsData(result.data)
      console.log('✅ 예약 데이터 로드 완료:', result.data.length, '건')
    } else {
      console.error('❌ 예약 데이터 로드 실패:', result.error)
    }
  }

  // Phase 6.4: 선불권 구매 내역 조회
  async function loadPrepaidPurchases() {
    if (!userSession.userId) {
      console.warn('⚠️ userId 없음: 선불권 조회 불가')
      return
    }

    setIsLoadingPrepaid(true)
    try {
      const response = await fetch(`/api/prepaid/my-purchases?user_id=${userSession.userId}`)
      const data = await response.json()

      if (data.success) {
        setPrepaidPurchases(data.purchases || [])
        console.log('✅ 선불권 조회 성공:', data.purchases.length, '건')
      } else {
        console.error('❌ 선불권 조회 실패:', data.error)
      }
    } catch (error) {
      console.error('💥 선불권 조회 오류:', error)
    } finally {
      setIsLoadingPrepaid(false)
    }
  }

  // Phase 6.4: 선불권 환불 처리
  async function handlePrepaidRefund(purchaseId: string) {
    if (!userSession.userId) {
      alert('로그인이 필요합니다.')
      return
    }

    try {
      const response = await fetch('/api/prepaid/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          purchase_id: purchaseId,
          user_id: userSession.userId,
        }),
      })

      const data = await response.json()

      if (data.success) {
        alert(data.message)
        // 선불권 목록 새로고침
        await loadPrepaidPurchases()
      } else {
        alert(data.error || '환불 처리에 실패했습니다.')
      }
    } catch (error) {
      console.error('💥 환불 처리 오류:', error)
      alert('환불 처리 중 오류가 발생했습니다.')
    }
  }

  const saveSession = (session: UserSession) => {
    localStorage.setItem('oneumSession', JSON.stringify(session))
    setUserSession(session)
    console.log('💾 세션 저장:', session)
  }

  const clearSession = () => {
    // ⭐ localStorage 완전 삭제
    localStorage.removeItem('oneumSession')
    
    // ⭐ 모든 관련 상태 초기화
    setUserSession({
      isLoggedIn: false,
      household: '',
      name: '',
      phone: '',
      isAdmin: false,
      userId: undefined
    })
    
    // ⭐ 예약 폼 상태도 초기화
    setName('')
    setPhone('')
    
    // ⭐ 인증 폼 상태 초기화
    setAuthHousehold('')
    setAuthName('')
    setAuthPhone('')
    setAuthPassword('')
    
    // ⭐ 모달 닫기
    setIsAuthModalOpen(false)
    
    console.log('🗑️ 세션 및 관련 상태 완전 삭제')
  }

  // ===== 상수 =====
  
  const timeSlots = Array.from({ length: 15 }, (_, i) => {
    const hour = i + 9
    return `${hour.toString().padStart(2, '0')}:00`
  })
  
  const households = ['201', '202', '301', '302', '401', '402', '501']

  // ===== 월 네비게이션 함수 =====
  
  const goToPrevMonth = () => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(newMonth.getMonth() - 1)
    setCurrentMonth(newMonth)
    console.log('📅 이전 달:', newMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }))
  }

  const goToNextMonth = () => {
    const newMonth = new Date(currentMonth)
    newMonth.setMonth(newMonth.getMonth() + 1)
    setCurrentMonth(newMonth)
    console.log('📅 다음 달:', newMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }))
  }

  // ===== 공간 탭 전환 =====
  
  const handleSpaceChange = (space: SpaceType) => {
    setSelectedSpace(space)
    console.log('🏠 공간 전환:', space === 'nolter' ? '놀터' : '방음실')
  }

  // ===== 예약 상태 확인 (실제 DB 데이터) =====
  
  const getBookingStatus = (date: number) => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    const dayBookings = bookingsData.filter(b => b.booking_date === dateStr && b.space === selectedSpace)
    
    if (dayBookings.length === 0) return { status: 'available', count: 0 }
    
    // 예약된 시간 슬롯 수 계산
    const totalSlots = timeSlots.length
    const bookedSlots = dayBookings.length
    
    if (bookedSlots >= totalSlots) return { status: 'full', count: bookedSlots }
    return { status: 'partial', count: bookedSlots }
  }

  // ===== 해당 날짜에 예약된 시간대 조회 =====
  
  const getBookedTimesForDate = (date: number): string[] => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    console.log(`🔍 DEBUG getBookedTimesForDate: targetDate = ${dateStr}, selectedSpace = ${selectedSpace}`)
    console.log(`🔍 DEBUG: bookingsData 전체 = ${bookingsData.length}건`, bookingsData)
    const dayBookings = bookingsData.filter(b => b.booking_date === dateStr && b.space === selectedSpace)
    
    console.log(`🔍 DEBUG: ${dateStr} ${selectedSpace} 예약 = ${dayBookings.length}건`, dayBookings)
    // 각 예약의 start_time부터 end_time까지 모든 시간 슬롯 추출
    const bookedTimes: string[] = []
    dayBookings.forEach(booking => {
      const start = booking.start_time.substring(0, 5) // "14:00:00" → "14:00"
      const end = booking.end_time.substring(0, 5)
      
      console.log(`🔍 DEBUG: 예약 ${booking.id}: start=${start}, end=${end}`)
      const startHour = parseInt(start.split(':')[0])
      let endHour = parseInt(end.split(':')[0])
      
      console.log(`🔍 DEBUG: startHour=${startHour}, endHour=${endHour}`)
      // ⭐ FIX: start_time == end_time일 때 1시간으로 처리
      if (endHour === startHour) {
        endHour = startHour + 1
        console.log(`🔧 ${dateStr} ${start}~${end} → 1시간으로 처리 (${start}~${endHour}:00)`)
      }
      
      // start_time부터 end_time까지 모든 시간 추가 (end 포함 안 함)
      // 예: 14:00-16:00 → ['14:00', '15:00']
      for (let h = startHour; h < endHour; h++) {
        const timeSlot = `${h.toString().padStart(2, '0')}:00`
        if (!bookedTimes.includes(timeSlot)) {
          bookedTimes.push(timeSlot)
          console.log(`➕ Added time slot: ${timeSlot}`)
        }
      }
    })
    
    console.log(`📋 ${dateStr} ${selectedSpace} 최종 예약된 시간:`, bookedTimes)
    return bookedTimes
  }


  // ===== 과거 날짜 확인 =====
  
  const isPastDate = (date: number): boolean => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const compareDate = new Date(year, month, date)
    compareDate.setHours(0, 0, 0, 0)
    
    return compareDate < today
  }


  // ⭐ 오늘 날짜 확인 (당일 예약 차단)
  const isToday = (date: number): boolean => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const compareDate = new Date(year, month, date)
    compareDate.setHours(0, 0, 0, 0)
    
    return compareDate.getTime() === today.getTime()
  }
  // ===== 해당 날짜의 총 예약 시간 계산 =====
  
  const getTotalHoursForDate = (date: number): number => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`
    
    const dayBookings = bookingsData.filter(b => b.booking_date === dateStr && b.space === selectedSpace)
    
    // 각 예약의 시간 합계
    const totalHours = dayBookings.reduce((sum, booking) => {
      const start = booking.start_time.substring(0, 5) // "14:00:00" → "14:00"
      const end = booking.end_time.substring(0, 5)
      
      const startHour = parseInt(start.split(':')[0])
      let endHour = parseInt(end.split(':')[0])
      
      // start_time == end_time일 때 1시간으로 처리
      if (endHour === startHour) {
        endHour = startHour + 1
      }
      
      const hours = endHour - startHour
      return sum + hours
    }, 0)
    
    return totalHours
  }

  // ===== 날짜 클릭 핸들러 =====
  
  const handleDateClick = (date: number) => {
    // ⭐ FIX 1: 과거 날짜 차단
    // ⭐ 오늘 날짜도 차단 (당일 예약 불가)
    if (isToday(date)) {
      console.log(`⛔ 당일 예약 차단: ${date}일`)
      return
    }
    if (isPastDate(date)) {
      console.log(`⛔ 과거 날짜 클릭 차단: ${date}일`)
      return
    }
    
    // 마감된 날짜 차단
    const bookingStatus = getBookingStatus(date)
    if (bookingStatus.status === 'full') {
      console.log(`⛔ 마감된 날짜 클릭 차단: ${date}일`)
      return
    }
    
    setSelectedDate(date)
    setSelectedTimes([])
    
    // ⭐ 예약된 시간 조회
    const times = getBookedTimesForDate(date)
    setBookedTimes(times)
    
    console.log(`🔍 DEBUG: ${date}일 예약 시간:`, times)
    
    // 로그인 상태면 사용자 정보 자동 입력 + 선불권 조회
    if (userSession.isLoggedIn) {
      setName(userSession.name)
      setPhone(userSession.phone)
      
      // Phase 6.5: 선불권 조회
      loadPrepaidPurchases()
    } else {
      setName('')
      setPhone('')
    }
    
    setIsBookingModalOpen(true)
    console.log(`📌 날짜 선택: ${currentMonth.getFullYear()}년 ${currentMonth.getMonth() + 1}월 ${date}일`)
  }

  // ===== 시간 선택 핸들러 (다중 선택) =====
  
  const handleTimeToggle = (time: string) => {
    setSelectedTimes(prev => {
      if (prev.includes(time)) {
        // 이미 선택된 시간이면 제거
        const newTimes = prev.filter(t => t !== time)
        console.log('⏰ 시간 선택 해제:', time, '→', newTimes)
        return newTimes
      } else {
        // 새로 선택
        const newTimes = [...prev, time].sort()
        console.log('⏰ 시간 선택 추가:', time, '→', newTimes)
        return newTimes
      }
    })
  }

  // ===== 예약하기 (실제 DB 저장) =====
  
  const handleBookingSubmit = async () => {
    if (isSubmitting) return
    // 검증
    if (selectedTimes.length === 0) {
      alert('시간을 선택해주세요.')
      return
    }

    if (!userSession.isLoggedIn) {
      if (!name.trim()) {
        alert('이름을 입력해주세요.')
        return
      }
      if (!phone.trim()) {
        alert('전화번호를 입력해주세요.')
        return
      }
    }

    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    const bookingDate = `${year}-${String(month).padStart(2, '0')}-${String(selectedDate).padStart(2, '0')}`

    // 예약 데이터 생성
    const bookingInput: CreateBookingInput = {
      bookingDate,
      times: selectedTimes,
      space: selectedSpace,
      memberType: userSession.isLoggedIn ? 'member' as const : 'non-member' as const,
      household: userSession.isLoggedIn ? userSession.household : undefined,
      name: userSession.isLoggedIn ? userSession.name : name,  // ⭐ Phase 6.5: 로그인 사용자는 세션 정보 사용
      phone: userSession.isLoggedIn ? userSession.phone : phone, // ⭐ Phase 6.5: 로그인 사용자는 세션 정보 사용
      userId: userSession.userId // ⭐ Phase 6.5: 선불권 사용을 위한 userId 전달
    }

    console.log('🚀 예약 시작:', bookingInput)
    console.log('🎫 userId:', userSession.userId || '(없음 - 선불권 미사용)')
    console.log('🎫 userId:', userSession.userId || '(없음 - 선불권 미사용)')

    // DB에 저장
    setIsSubmitting(true)
    const result = await createBooking(bookingInput)
    setIsSubmitting(false)

    if (result.success) {
      console.log('=== ✅ 예약 완료 ===')
      console.log('날짜:', bookingDate)
      console.log('시간:', selectedTimes.join(', '), `(총 ${selectedTimes.length}시간)`)
      console.log('공간:', selectedSpace === 'nolter' ? '놀터' : '방음실')
      console.log('예약자:', userSession.isLoggedIn ? `${userSession.household}호 ${name}` : name)
      console.log('연락처:', phone)

      // Phase 6.5: 선불권 사용 정보 표시
      let paymentInfo = ''
      if (result.data?.payment_status === 'prepaid') {
        paymentInfo = `\n\n🎫 선불권 ${result.data.prepaid_hours_used}시간 사용\n잔여: (조회 필요)`
      } else if (result.data?.prepaid_hours_used > 0) {
        paymentInfo = `\n\n🎫 선불권 ${result.data.prepaid_hours_used}시간 사용\n💰 일반 결제 ${result.data.regular_hours}시간 (${result.data.amount}원)\n계좌: 카카오뱅크 7979-72-56275 (정상은)`
      } else if (!userSession.isLoggedIn) {
        paymentInfo = `\n\n💰 결제 안내\n금액: ${selectedTimes.length * 14000}원\n계좌: 카카오뱅크 7979-72-56275 (정상은)\n예약자명으로 입금해주세요.`
      }
      
      alert(`예약이 완료되었습니다!\n\n날짜: ${month}월 ${selectedDate}일\n시간: ${selectedTimes.join(', ')} (총 ${selectedTimes.length}시간)\n공간: ${selectedSpace === 'nolter' ? '놀터' : '방음실'}${paymentInfo}`)
      setIsBookingModalOpen(false)
      
      // 예약 목록 새로고침
      loadBookings()
      
      // 선불권 사용한 경우 선불권 목록도 새로고침
      if (result.data?.prepaid_hours_used > 0) {
        loadPrepaidPurchases()
      }
    } else {
      console.error('❌ 예약 실패:', result.error)
      alert(`예약 실패: ${result.error}`)
    }
  }

  // ===== 로그인 ===== 
  // ⭐ VERSION: v1.0.5 - Login Debug Enhanced
  
  const handleLogin = async () => {
    console.log('='.repeat(50))
    console.log('🔑 [LOGIN v1.0.5] handleLogin 함수 실행됨!')
    console.log('='.repeat(50))
    console.log('🔑 [LOGIN] authName:', authName)
    console.log('🔑 [LOGIN] authPassword:', authPassword ? '***' : '(empty)')
    console.log('🔑 [LOGIN] authMode:', authMode)
    
    if (!authName.trim()) {
      console.warn('⚠️ [LOGIN] 이름 입력 필요')
      alert('이름을 입력해주세요.')
      return
    }
    if (!authPassword.trim()) {
      console.warn('⚠️ [LOGIN] 비밀번호 입력 필요')
      alert('비밀번호를 입력해주세요.')
      return
    }

    try {
      console.log('🚀 [LOGIN] API 호출 시작...')
      const result = await login({
        name: authName,
        password: authPassword
      })
      console.log('📥 [LOGIN] API 응답:', result)

      if (!result.success) {
        console.error('❌ [LOGIN] 로그인 실패:', result.error)
        alert(result.error)
        return
      }

      // 🐛 FIX: userId 디버깅
      console.log('🔍 [LOGIN] result.user 전체:', result.user)
      console.log('🔍 [LOGIN] result.user.id:', result.user.id)
      
      // 세션 저장 (세대 정보 + 관리자 권한 자동 포함!)
      const session: UserSession = {
        isLoggedIn: true,
        household: result.user.household,
        name: result.user.name,
        phone: result.user.phone,
        isAdmin: result.user.is_admin || false,
        userId: result.user.id // Phase 6.3: 선불권 구매를 위한 user_id
      }

      console.log('💾 [LOGIN] 세션 저장:', session)
      console.log('💾 [LOGIN] userId 확인:', session.userId)
      saveSession(session)
      setIsAuthModalOpen(false)
      alert(`${result.user.name}님 로그인되었습니다!`)
      console.log('✅ [LOGIN] 로그인 성공!')
      
      // 폼 초기화
      setAuthName('')
      setAuthPassword('')
    } catch (error) {
      console.error('💥 [LOGIN] 예외 발생:', error)
      alert('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
    }
  }

  // ===== 회원가입 =====
  
  const handleSignup = async () => {
    // Phase 6.1: 세대원 체크 시에만 세대 번호 필수
    if (authIsResident && !authHousehold) {
      alert('세대를 선택해주세요.')
      return
    }
    if (!authName.trim()) {
      alert('이름을 입력해주세요.')
      return
    }
    if (!authPhone.trim()) {
      alert('전화번호를 입력해주세요.')
      return
    }
    if (!authPassword.trim()) {
      alert('비밀번호를 설정해주세요.')
      return
    }

    const result = await signup({
      household: authIsResident ? authHousehold : '', // 세대원이 아니면 빈 문자열
      name: authName,
      phone: authPhone,
      password: authPassword,
      isResident: authIsResident // Phase 6.1: 세대원 여부 추가
    })

    if (!result.success) {
      alert(result.error)
      return
    }

    alert('회원가입이 완료되었습니다!')
    setAuthMode('login')
    
    // 입력 필드 초기화
    setAuthHousehold('')
    setAuthName('')
    setAuthPhone('')
    setAuthPassword('')
    setAuthIsResident(false) // Phase 6.1: 초기화
  }

  // ===== 로그아웃 =====
  
  const handleLogout = () => {
    if (confirm('로그아웃 하시겠습니까?')) {
      console.log('[로그아웃] 시작')
      clearSession()
      console.log('[로그아웃] 완료 - localStorage 삭제됨, 상태 초기화됨')
      alert('로그아웃되었습니다.')
      
      // Note: reload 불필요 - clearSession의 state 변경으로 UI 자동 업데이트
    }
  }
  // ===== 비밀번호 찾기 =====

  const handleForgotPassword = async () => {
    if (!authName.trim()) {
      alert('이름을 입력해주세요.')
      return
    }
    if (!authPhone.trim()) {
      alert('가입 시 등록한 전화번호를 입력해주세요.')
      return
    }

    const result = await resetPassword(authName, authPhone)
    if (!result.success) {
      alert(result.error || '비밀번호 재설정에 실패했습니다.')
      return
    }

    alert('임시 비밀번호가 등록된 전화번호로 발송되었습니다.')
    setAuthMode('login')
    setAuthName('')
    setAuthPhone('')
  }


  // ===== 내 예약 조회 =====
  const handleFetchMyBookings = async () => {
    // 로그인된 경우: household로 조회
    // 비로그인: 전화번호로 조회
    if (userSession.isLoggedIn && userSession.household) {
      setIsLoadingBookings(true)
      try {
        const result = await getBookingsByHousehold(userSession.household)
        if (result.success) {
          setMyBookings(result.data)
          if (result.data.length === 0) {
            alert('예약 내역이 없습니다.')
          }
        } else {
          alert(`조회 실패: ${result.error}`)
        }
      } catch (error) {
        console.error('예약 조회 오류:', error)
        alert('예약 조회 중 오류가 발생했습니다.')
      } finally {
        setIsLoadingBookings(false)
      }
    } else {
      // 비로그인: 전화번호로 조회
      const phoneToSearch = managePhone.trim()
      
      if (!phoneToSearch) {
        alert('전화번호를 입력해주세요.')
        return
      }

      setIsLoadingBookings(true)
      
      try {
        const result = await getBookingsByPhone(phoneToSearch)
        
        if (result.success) {
          setMyBookings(result.data)
          if (result.data.length === 0) {
            alert('예약 내역이 없습니다.')
          }
        } else {
          alert(`조회 실패: ${result.error}`)
        }
      } catch (error) {
        console.error('예약 조회 오류:', error)
        alert('예약 조회 중 오류가 발생했습니다.')
      } finally {
        setIsLoadingBookings(false)
      }
    }
  }

  // ===== 예약 취소 =====
  const handleCancelBooking = async (bookingId: string, bookingInfo: string) => {
    if (!confirm(`정말 취소하시겠습니까?\n\n${bookingInfo}`)) {
      return
    }
    
    try {
      const result = await cancelBooking(bookingId)
      
      if (result.success) {
        // 예약 목록 새로고침 (await 추가)
        await handleFetchMyBookings()
        
        // 달력 데이터도 새로고침 (await 추가)
        await loadBookings()
        
        alert('예약이 취소되었습니다.')
      } else {
        alert(`취소 실패: ${result.error}`)
      }
    } catch (error) {
      console.error('예약 취소 오류:', error)
      alert('예약 취소 중 오류가 발생했습니다.')
    }
  }
  // ===== 달력 렌더링 =====
  
  const year = currentMonth.getFullYear()
  const month = currentMonth.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDayOfWeek = new Date(year, month, 1).getDay() // 0=일(Sun)~6=토(Sat)
  // null = 빈 칸, number = 날짜
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* ===== 헤더 ===== */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">온음 공간 예약</h1>
            <p className="text-base sm:text-lg text-gray-600">놀터 & 방음실 예약 시스템</p>
          </div>
          
          {/* 우측 버튼들 */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {userSession.isLoggedIn ? (
              <>
                <div className="text-left sm:text-right mr-0 sm:mr-3">
                  <p className="text-xs sm:text-sm font-semibold text-gray-900">{userSession.household}호</p>
                  <p className="text-xs text-gray-600">{userSession.name}</p>
                  {userSession.isAdmin && (
                    <p className="text-xs text-blue-600 font-medium">⚡ 관리자</p>
                  )}
                </div>
                {userSession.isAdmin && (
                  <button
                    onClick={() => window.location.href = '/admin'}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 whitespace-nowrap"
                  >
                    관리자
                  </button>
                )}
                <button
                  onClick={() => window.location.href = '/mypage'}
                  className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 whitespace-nowrap"
                >
                  마이페이지
                </button>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 whitespace-nowrap"
                >
                  로그아웃
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setAuthMode('login')
                  setIsAuthModalOpen(true)
                }}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 whitespace-nowrap"
              >
                회원 로그인
              </button>
            )}
            <button
              onClick={() => setIsPrepaidModalOpen(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 whitespace-nowrap"
            >
              🎟️ 선불권 구매
            </button>
            <button type="button"
              onClick={() => {
                setManagePhone('')
                setMyBookings([])
                setIsManageModalOpen(true)
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200 whitespace-nowrap"
            >
              예약 변경/취소
            </button>
          </div>
        </div>

        {/* ===== 달력 카드 ===== */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          {/* 공간 선택 탭 */}
          <div className="flex gap-4 mb-6">
            <button
              onClick={() => handleSpaceChange('nolter')}
              className={`px-6 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                selectedSpace === 'nolter'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              놀터
            </button>
            <button
              onClick={() => handleSpaceChange('soundroom')}
              className={`px-6 py-3 text-base font-semibold rounded-lg transition-all duration-200 ${
                selectedSpace === 'soundroom'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              방음실
            </button>
          </div>

          {/* ===== 공간 사진 갤러리 ===== */}
          <div className="mb-6">
            <SpaceGallery space={selectedSpace} />
          </div>

          {/* ⚠️ 예약 안내 문구 */}
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
            <p className="text-sm font-semibold text-blue-800">
              ⚠️ 예약은 최소 1일 전까지 가능합니다
            </p>
            <p className="text-xs text-blue-600 mt-1">
              당일 예약은 불가능하며, 내일부터 선택 가능합니다.
            </p>
          </div>

          {/* 월 네비게이션 */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={goToPrevMonth}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              ← 이전
            </button>
            <h2 className="text-lg sm:text-xl font-bold text-gray-900">
              {year}년 {month + 1}월
            </h2>
            <button
              onClick={goToNextMonth}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded transition-colors"
            >
              다음 →
            </button>
          </div>

          {/* 요일 */}
          <div className="grid grid-cols-7 gap-2 sm:gap-3 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map(day => (
              <div key={day} className="text-center font-semibold text-gray-700 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 - 모바일 세로 간격 증가 */}
          <div className="grid grid-cols-7 gap-x-2 gap-y-6 sm:gap-3">
            {calendarCells.map((date, idx) => {
              if (date === null) {
                return <div key={`empty-${idx}`} className="aspect-square" />
              }
              const isPast = isPastDate(date)
              const bookingStatus = getBookingStatus(date)
              const totalHours = getTotalHoursForDate(date)
              const isTodayHighlight = new Date().getDate() === date && new Date().getMonth() === month && new Date().getFullYear() === year
              const isTodayDate = isToday(date)
              
              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  {/* 날짜 박스 */}
                  <button
                    onClick={() => handleDateClick(date)}
                    className={`w-full aspect-square rounded-xl p-2 transition-all ${
                      isPast || isTodayDate
                        ? 'opacity-50 cursor-not-allowed bg-gray-100 border-2 border-gray-300'
                        : 
                      bookingStatus.status === 'full'
                        ? 'bg-gray-100 border-2 border-gray-400 cursor-not-allowed'
                        : totalHours > 0
                        ? 'bg-blue-100 border-2 border-blue-400 hover:bg-blue-200'
                        : 'bg-white border-2 border-gray-200 hover:bg-blue-50 hover:border-blue-400'
                    }`}
                    disabled={isPast || isTodayDate || bookingStatus.status === 'full'}
                  >
                    {/* 날짜 + 시간 레이아웃 */}
                    <div className="flex flex-col items-center justify-center h-full">
                      {/* 날짜 */}
                      <div className={`text-sm font-semibold ${
                        isTodayHighlight ? 'text-blue-600' : 'text-gray-700'
                      }`}>
                        {date}
                      </div>
                      
                      {/* PC만: 박스 안에 예약 시간 표시 */}
                      {totalHours > 0 && bookingStatus.status !== 'full' && (
                        <div className="hidden sm:block text-sm font-bold text-blue-600 mt-1">
                          {totalHours}시간
                        </div>
                      )}
                      
                      {/* 마감 표시 */}
                      {bookingStatus.status === 'full' && (
                        <div className="text-xs sm:text-sm text-red-500 font-semibold mt-1">
                          마감
                        </div>
                      )}
                    </div>
                  </button>
                  
                  {/* 모바일만: 박스 바깥 하단에 예약 시간 표시 */}
                  {totalHours > 0 && bookingStatus.status !== 'full' && (
                    <div className="sm:hidden text-xs font-medium text-blue-600">
                      {totalHours}시간
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* ===== 공간 정보 ===== */}
        {spacesInfo && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">🏠 공간 안내</h3>
            <div className="w-full">
              {/* 놀터 */}
              {selectedSpace === 'nolter' && (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                  <h4 className="text-lg font-bold text-blue-900 mb-2">🏠 {spacesInfo.nolter.name}</h4>
                  <p className="text-sm text-gray-700 mb-4">{spacesInfo.nolter.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 좌측: 기본정보 및 시설 */}
                    <div className="space-y-3 text-sm">
                      <div className="flex"><span className="font-medium text-gray-600 w-16">👥 인원:</span> <span className="text-gray-900 flex-1">{spacesInfo.nolter.capacity}</span></div>
                      <div className="flex"><span className="font-medium text-gray-600 w-16">🕐 운영:</span> <span className="text-gray-900 flex-1">{spacesInfo.nolter.hours}</span></div>
                      <div className="flex"><span className="font-medium text-gray-600 w-16">💰 요금:</span> <span className="text-gray-900 flex-1">회원 {spacesInfo.nolter.pricing.member} / 비회원 {spacesInfo.nolter.pricing.nonMember}</span></div>
                      <div className="flex"><span className="font-medium text-gray-600 w-16">🔧 시설:</span> <span className="text-gray-900 flex-1">{spacesInfo.nolter.facilities.join(', ')}</span></div>
                    </div>
                    
                    {/* 우측: 이용 규칙 */}
                    {spacesInfo.nolter.rules && spacesInfo.nolter.rules.length > 0 && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-600 block mb-2">📋 이용 규칙:</span>
                        <ul className="space-y-1">
                          {spacesInfo.nolter.rules.map((rule, index) => (
                            <li key={index} className="text-gray-900 flex items-start">
                              <span className="mr-2 text-blue-400">•</span>
                              <span className="flex-1">{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* 방음실 */}
              {selectedSpace === 'soundroom' && (
                <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
                  <h4 className="text-lg font-bold text-purple-900 mb-2">🎵 {spacesInfo.soundroom.name}</h4>
                  <p className="text-sm text-gray-700 mb-4">{spacesInfo.soundroom.description}</p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* 좌측: 기본정보 및 시설 */}
                    <div className="space-y-3 text-sm">
                      <div className="flex"><span className="font-medium text-gray-600 w-16">👥 인원:</span> <span className="text-gray-900 flex-1">{spacesInfo.soundroom.capacity}</span></div>
                      <div className="flex"><span className="font-medium text-gray-600 w-16">🕐 운영:</span> <span className="text-gray-900 flex-1">{spacesInfo.soundroom.hours}</span></div>
                      <div className="flex"><span className="font-medium text-gray-600 w-16">💰 요금:</span> <span className="text-gray-900 flex-1">회원 {spacesInfo.soundroom.pricing.member} / 비회원 {spacesInfo.soundroom.pricing.nonMember}</span></div>
                      <div className="flex"><span className="font-medium text-gray-600 w-16">🔧 시설:</span> <span className="text-gray-900 flex-1">{spacesInfo.soundroom.facilities.join(', ')}</span></div>
                    </div>
                    
                    {/* 우측: 이용 규칙 */}
                    {spacesInfo.soundroom.rules && spacesInfo.soundroom.rules.length > 0 && (
                      <div className="text-sm">
                        <span className="font-medium text-gray-600 block mb-2">📋 이용 규칙:</span>
                        <ul className="space-y-1">
                          {spacesInfo.soundroom.rules.map((rule, index) => (
                            <li key={index} className="text-gray-900 flex items-start">
                              <span className="mr-2 text-purple-400">•</span>
                              <span className="flex-1">{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===== 이용 규칙 ===== */}
        {generalRules && (
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">📜 이용 규칙</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 예약 규정 */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-base font-semibold text-gray-900 mb-3">📅 예약 규정</h4>
                <ul className="space-y-1">
                  {generalRules.booking.map((rule, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start">
                      <span className="mr-2 text-gray-400">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* 취소 및 환불 */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-base font-semibold text-gray-900 mb-3">🔄 취소 및 환불</h4>
                <ul className="space-y-1">
                  {generalRules.cancellation.map((rule, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start">
                      <span className="mr-2 text-gray-400">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* 입금 안내 */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-base font-semibold text-gray-900 mb-3">💳 입금 안내</h4>
                <ul className="space-y-1">
                  {generalRules.payment.map((rule, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start">
                      <span className="mr-2 text-gray-400">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
              
              {/* 이용 수칙 */}
              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="text-base font-semibold text-gray-900 mb-3">⚠️ 이용 수칙</h4>
                <ul className="space-y-1">
                  {generalRules.usage.map((rule, index) => (
                    <li key={index} className="text-sm text-gray-700 flex items-start">
                      <span className="mr-2 text-gray-400">•</span>
                      <span>{rule}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>온음 공동체 공간 예약 시스템</p>
        </div>
      </div>

      {/* ===== 예약 모달 ===== */}
      {isBookingModalOpen && selectedDate !== null && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setIsBookingModalOpen(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {selectedSpace === 'nolter' ? '🏠 놀터' : '🎵 방음실'} 예약하기 - {month + 1}월 {selectedDate}일
              </h2>
              <button 
                onClick={() => setIsBookingModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-6">
              {/* 시간 선택 (다중) */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  시간 선택 * (연속 시간 선택 가능)
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map(time => {
                    const isBooked = bookedTimes.includes(time)
                    const isSelected = selectedTimes.includes(time)
                    
                    console.log(`🔍 ${time}: isBooked=${isBooked}, isSelected=${isSelected}`)
                    
                    return (
                      <button
                        key={time}
                        onClick={() => !isBooked && handleTimeToggle(time)}
                        disabled={isBooked}
                        className={`py-3 px-4 rounded-lg border font-medium transition-colors ${
                          isBooked
                            ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <div>{time}</div>
                        {isBooked && (
                          <div className="text-xs mt-1">예약됨</div>
                        )}
                      </button>
                    )
                  })}
                </div>
                {selectedTimes.length > 0 && (
                  <p className="mt-3 text-sm text-blue-600 font-medium">
                    총 {selectedTimes.length}시간 선택됨: {selectedTimes.join(', ')}
                  </p>
                )}
              </div>

              {/* 회원 로그인 상태 */}
              {userSession.isLoggedIn ? (
                <div className="space-y-4">
                  {/* Phase 6.5: 선불권 정보 표시 */}
                  {(() => {
                    const totalHours = getTotalRemainingHours(prepaidPurchases)
                    if (totalHours > 0 && selectedTimes.length > 0) {
                      const usage = calculatePrepaidUsage(prepaidPurchases, selectedTimes.length)
                      return (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-sm font-semibold text-green-800">
                              🎫 보유 선불권: {totalHours}시간
                            </p>
                          </div>
                          <div className="text-sm text-green-700 space-y-1">
                            {usage.isFullyPrepaid ? (
                              <>
                                <p>✅ 선불권 사용: {usage.prepaidHours}시간</p>
                                <p>💰 결제 금액: 0원</p>
                                <p className="text-xs text-green-600 mt-2">
                                  잔여 선불권: {totalHours - usage.prepaidHours}시간
                                </p>
                              </>
                            ) : (
                              <>
                                <p>🎫 선불권 사용: {usage.prepaidHours}시간</p>
                                <p>💳 일반 결제: {usage.regularHours}시간</p>
                                <p>💰 결제 금액: {usage.amount.toLocaleString()}원</p>
                                <p className="text-xs text-orange-600 mt-2">
                                  ⚠️ 선불권 {usage.prepaidHours}시간 소진 후 나머지는 일반 예약으로 처리됩니다.
                                </p>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    } else if (totalHours > 0) {
                      return (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <p className="text-sm font-semibold text-blue-800">
                            🎫 보유 선불권: {totalHours}시간
                          </p>
                          <p className="text-xs text-blue-600 mt-1">
                            시간을 선택하면 선불권 사용 내역이 표시됩니다.
                          </p>
                        </div>
                      )
                    }
                    return null
                  })()}
                  
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      세대 정보
                    </label>
                    <div className="py-3 px-4 bg-gray-100 rounded-lg text-gray-700">
                      {userSession.household}호
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      이름 *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      전화번호
                    </label>
                    <div className="py-3 px-4 bg-gray-100 rounded-lg text-gray-700">
                      {userSession.phone}
                    </div>
                  </div>
                </div>
              ) : (
                /* 비회원 상태 */
                <div className="space-y-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">
                      💡 <strong>온음 세대 주민이신가요?</strong>{' '}
                      <button
                        onClick={() => {
                          setIsBookingModalOpen(false)
                          setAuthMode('login')
                          setIsAuthModalOpen(true)
                        }}
                        className="text-blue-600 underline font-medium hover:text-blue-700"
                      >
                        회원으로 예약하기
                      </button>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      이름 *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름을 입력하세요"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      전화번호 *
                    </label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {/* ⭐ 비회원 결제 안내 */}
                  {!userSession.isLoggedIn && selectedTimes.length > 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                      <p className="text-sm font-semibold text-yellow-800">
                        💰 예상 결제 금액: {selectedTimes.length * 14000}원
                      </p>
                      <p className="text-xs text-yellow-700 mt-1">
                        입금계좌: 카카오뱅크 7979-72-56275 (정상은)
                      </p>
                      <p className="text-xs text-yellow-600 mt-1">
                        예약자명으로 입금해주세요.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
              <button
                onClick={handleBookingSubmit}
                disabled={isSubmitting}
                className={`w-full py-4 text-white font-semibold rounded-lg transition-colors ${isSubmitting ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
              >
                {isSubmitting ? '예약 중...' : '예약하기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== 로그인/회원가입 모달 ===== */}
      {isAuthModalOpen && (() => {
        console.log('🪟 [MODAL v1.0.5] 인증 모달 렌더링됨')
        console.log('🪟 [MODAL] authMode:', authMode)
        console.log('🪟 [MODAL] authName:', authName)
        return true
      })() && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setIsAuthModalOpen(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {authMode === 'login' ? '로그인' : authMode === 'signup' ? '회원가입' : '비밀번호 찾기'}
              </h2>
              <button 
                onClick={() => setIsAuthModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-4">
              {authMode === 'forgot' ? (
                /* ⭐ 비밀번호 찾기 폼 */
                <>
                  <p className="text-sm text-gray-500">가입 시 등록한 이름과 전화번호를 입력하세요.</p>
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      이름 *
                    </label>
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="이름을 입력하세요"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      전화번호 *
                    </label>
                    <input
                      type="tel"
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <button
                    onClick={handleForgotPassword}
                    className="w-full py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    임시 비밀번호 발급
                  </button>

                  <div className="text-center text-sm text-gray-600">
                    <button
                      onClick={() => {
                        setAuthMode('login')
                        setAuthName('')
                        setAuthPhone('')
                      }}
                      className="text-blue-600 font-medium hover:underline"
                    >
                      로그인으로 돌아가기
                    </button>
                  </div>
                </>
              ) : (
                /* 기존 로그인/회원가입 폼 */
                <>
                  {/* Phase 6.1: 회원가입 - 세대원 여부 체크 */}
                  {authMode === 'signup' && (
                    <div className="space-y-4">
                      {/* 세대원 여부 체크박스 */}
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={authIsResident}
                            onChange={(e) => {
                              setAuthIsResident(e.target.checked)
                              if (!e.target.checked) {
                                setAuthHousehold('') // 체크 해제 시 세대 번호 초기화
                              }
                            }}
                            className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <span className="text-sm font-medium text-gray-900">
                            저는 온음 세대 입주민입니다 (201~501호)
                          </span>
                        </label>
                      </div>

                      {/* 세대 선택 (세대원 체크 시에만 노출) */}
                      {authIsResident && (
                        <div>
                          <label className="block text-sm font-semibold text-gray-900 mb-2">
                            세대 선택 *
                          </label>
                          <select
                            value={authHousehold}
                            onChange={(e) => setAuthHousehold(e.target.value)}
                            className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">세대를 선택하세요</option>
                            {households.map(h => (
                              <option key={h} value={h}>{h}호</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 이름 (로그인 + 회원가입 공통) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      이름 *
                    </label>
                    <input
                      type="text"
                      value={authName}
                      onChange={(e) => setAuthName(e.target.value)}
                      placeholder="이름을 입력하세요"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 회원가입: 전화번호 */}
                  {authMode === 'signup' && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">
                        전화번호 *
                      </label>
                      <input
                        type="tel"
                        value={authPhone}
                        onChange={(e) => setAuthPhone(e.target.value)}
                        placeholder="010-0000-0000"
                        className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}

                  {/* 비밀번호 (로그인 + 회원가입 공통) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      비밀번호 *
                    </label>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="비밀번호를 입력하세요"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 로그인 버튼 */}
                  <button
                    onClick={() => {
                      console.log('🖱️ [BUTTON CLICK v1.0.5] 버튼 클릭 감지됨!')
                      console.log('🖱️ [BUTTON] authMode:', authMode)
                      console.log('🖱️ [BUTTON] 실행할 함수:', authMode === 'login' ? 'handleLogin' : 'handleSignup')
                      
                      if (authMode === 'login') {
                        handleLogin()
                      } else {
                        handleSignup()
                      }
                    }}
                    className="w-full py-3 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    {authMode === 'login' ? '로그인' : '가입하기'}
                  </button>

                  {/* ⭐ 비밀번호 찾기 링크 (로그인 모드일 때만) */}
                  {authMode === 'login' && (
                    <div className="text-center text-sm">
                      <button
                        onClick={() => {
                          setAuthMode('forgot')
                          setAuthHousehold('')
                          setAuthPhone('')
                          setAuthPassword('')
                        }}
                        className="text-gray-500 hover:text-gray-700 hover:underline"
                      >
                        비밀번호를 잊으셨나요?
                      </button>
                    </div>
                  )}

                  {/* 모드 전환 */}
                  <div className="text-center text-sm text-gray-600">
                    {authMode === 'login' ? (
                      <>
                        아직 회원이 아니신가요?{' '}
                        <button
                          onClick={() => {
                            setAuthMode('signup')
                            setAuthHousehold('')
                            setAuthPassword('')
                          }}
                          className="text-blue-600 font-medium hover:underline"
                        >
                          회원가입
                        </button>
                      </>
                    ) : (
                      <>
                        이미 회원이신가요?{' '}
                        <button
                          onClick={() => {
                            setAuthMode('login')
                            setAuthName('')
                            setAuthPhone('')
                            setAuthHousehold('')
                            setAuthPassword('')
                          }}
                          className="text-blue-600 font-medium hover:underline"
                        >
                          로그인
                        </button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== 예약 관리 모달 ===== */}
      {isManageModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => setIsManageModalOpen(false)}
        >
          <div 
            className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[85vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">예약 변경/취소</h2>
              <button 
                onClick={() => setIsManageModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl leading-none p-1"
              >
                ×
              </button>
            </div>

            {/* 본문 */}
            <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(85vh-80px)]">
              {/* 회원 로그인 상태 */}
              {userSession.isLoggedIn ? (
                <div className="bg-blue-50 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">👤</span>
                    <span className="font-medium text-blue-900">
                      {userSession.household}호 {userSession.name}님
                    </span>
                  </div>
                  <button
                    onClick={handleFetchMyBookings}
                    disabled={isLoadingBookings}
                    className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
                  >
                    {isLoadingBookings ? '조회 중...' : '내 예약 조회'}
                  </button>
                </div>
              ) : (
                /* 비회원 - 전화번호 입력 */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      예약 시 사용한 전화번호 *
                    </label>
                    <input
                      type="tel"
                      value={managePhone}
                      onChange={(e) => setManagePhone(e.target.value)}
                      placeholder="010-0000-0000"
                      className="w-full py-3 px-4 border border-gray-300 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  <button
                    onClick={handleFetchMyBookings}
                    disabled={isLoadingBookings || !managePhone.trim()}
                    className="w-full py-3 bg-blue-500 text-white font-medium rounded-xl hover:bg-blue-600 disabled:bg-gray-400 transition-colors"
                  >
                    {isLoadingBookings ? '조회 중...' : '예약 조회'}
                  </button>
                  
                  <div className="text-center">
                    <button
                      onClick={() => {
                        setIsManageModalOpen(false)
                        setAuthMode('login')
                        setIsAuthModalOpen(true)
                      }}
                      className="text-sm text-blue-600 hover:underline"
                    >
                      회원 로그인하기
                    </button>
                  </div>
                </div>
              )}

              {/* 예약 목록 */}
              {myBookings.length > 0 && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span>📋</span>
                    <span>예약 내역 ({myBookings.length}건)</span>
                  </h3>
                  
                  <div className="space-y-3">
                    {myBookings.map(booking => {
                      const spaceLabel = booking.space === 'nolter' ? '🏠 놀터' : '🎵 방음실'
                      const dateObj = new Date(booking.booking_date)
                      const dateLabel = `${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일`
                      const timeLabel = `${booking.start_time.substring(0, 5)} ~ ${booking.end_time.substring(0, 5)}`
                      const bookingInfo = `${dateLabel} ${timeLabel}\n${spaceLabel}`
                      
                      return (
                        <div 
                          key={booking.id} 
                          className="border border-gray-200 rounded-xl p-4 bg-gray-50"
                        >
                          <div className="flex justify-between items-start gap-3">
                            <div className="flex-1">
                              <p className="font-medium text-gray-900">
                                {spaceLabel}
                              </p>
                              <p className="text-sm text-gray-600 mt-1">
                                📅 {dateLabel}
                              </p>
                              <p className="text-sm text-gray-600">
                                ⏰ {timeLabel}
                              </p>
                              <p className="text-xs text-gray-400 mt-2">
                                예약자: {booking.name}
                              </p>
                            </div>
                            {/* 로그인: 본인 예약만 취소 가능 / 비로그인: 전화번호로 조회했으므로 모두 취소 가능 */}
                            {(!userSession.isLoggedIn || booking.name === userSession.name) && (
                              <button
                                onClick={() => handleCancelBooking(booking.id, bookingInfo)}
                                className="px-4 py-2 text-sm text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition-colors whitespace-nowrap"
                              >
                                취소
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
              
              {/* 안내 메시지 */}
              <div className="bg-gray-100 rounded-xl p-4 text-sm text-gray-600">
                <p className="mb-2">💡 <strong>안내</strong></p>
                <ul className="space-y-1 text-xs">
                  <li>• 예약 취소는 당일 예약도 가능합니다.</li>
                  <li>• 취소된 예약은 복구할 수 없습니다.</li>
                  <li>• 예약 시간 변경은 취소 후 재예약해주세요.</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== 선불권 구매 모달 ===== */}
      <PrepaidPurchaseModal
        isOpen={isPrepaidModalOpen}
        onClose={() => setIsPrepaidModalOpen(false)}
        userSession={userSession}
        onLoginClick={() => {
          setIsPrepaidModalOpen(false)
          setAuthMode('login')
          setIsAuthModalOpen(true)
        }}
        onSignupClick={() => {
          setIsPrepaidModalOpen(false)
          setAuthMode('signup')
          setIsAuthModalOpen(true)
        }}
      />
    </div>
  )
}
