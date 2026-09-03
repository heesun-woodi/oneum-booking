// 🔄 v1.0.4 - 구조화된 공간 정보 & 이용 규칙
'use client'

import { useState, useEffect } from 'react'
import { createBooking, getBookings, getBookingsByPhone, getBookingsByHousehold, getBookingsByUserId, cancelBooking, getHouseholdNolterQuota, CreateBookingInput, HouseholdNolterQuota } from './actions/bookings'
import { signup, login, resetPassword } from './actions/auth'
import { getSpacesInfo, getGeneralRulesFromDB, SpacesInfo, GeneralRules } from './actions/structured-settings'
import { getMyPrepaidPurchases, PrepaidPurchase as PrepaidPurchaseType } from './actions/prepaid'
import { PrepaidLike, formatHours, resolveUserKind } from '@/lib/booking-policy'
import { KstNow, getKstNow, timeToMinutes, toDateString } from '@/lib/date-kst'
import { BookingChargeSummary } from './components/BookingChargeSummary'
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
  isResident?: boolean // 세대 회원 여부
}

type SpaceType = 'nolter' | 'soundroom'

// 이용 안내 목록에서 세대원에게만 바꿔 끼우는 문구.
// 관리자가 어드민 설정에서 해당 줄을 '당일 예약' 이라는 표현 없이 다시 쓰면
// 세대원 화면에 두 줄이 함께 보이므로, 그때는 MARKER 를 맞춰 조정할 것.
const SAME_DAY_RULE_MARKER = '당일 예약'
const RESIDENT_SAME_DAY_RULE = '온음 세대원은 당일 예약이 가능합니다 (이미 시작된 시간대는 제외)'

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

  // Phase 8: 세대 이번 달 놀터 무료 한도 현황 (8월부터 월 20시간 / 7월까지 월 3회)
  const [nolterQuota, setNolterQuota] = useState<HouseholdNolterQuota | null>(null)
  
  // KST 기준 현재 시각. 30초마다 갱신해서 '지난 시간대' 판정이 낡지 않게 한다.
  // (실제 강제는 서버가 한다 — 여기서는 UX 를 맞출 뿐이다)
  const [kstNow, setKstNow] = useState<KstNow>(() => getKstNow())

  // 달력 & 예약
  // 항상 '그 달 1일'로 정규화해서 들고 있는다. 오늘의 일(day)을 들고 다니면
  // setMonth 로 달을 옮길 때 짧은 달에서 오버플로우가 난다 (8/31 → 다음 달 → 9/31 → 10월).
  // 기준 달도 KST 여야 한다. 브라우저 로컬로 잡으면 로컬 월말/KST 월초가 갈릴 때
  // 달력이 지난 달로 열리고 모든 날짜가 과거로 판정된다.
  const [currentMonth, setCurrentMonth] = useState(() => {
    const [y, m] = getKstNow().dateStr.split('-').map(Number)
    return new Date(y, m - 1, 1)
  })
  const [selectedSpace, setSelectedSpace] = useState<SpaceType>('nolter')
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]) // 연속 시간 다중 선택
  
  // 예약 폼
  const [name, setName] = useState<string>('')
  const [phone, setPhone] = useState<string>('')
  const [nonMemberConsent, setNonMemberConsent] = useState<boolean>(false)
  const [bookedTimes, setBookedTimes] = useState<Record<string, string>>({}) // 시간 → 예약자 이름
  
  // 인증 폼
  const [authHousehold, setAuthHousehold] = useState<string>('')
  const [authName, setAuthName] = useState<string>('')
  const [authPhone, setAuthPhone] = useState<string>('')
  const [authPassword, setAuthPassword] = useState<string>('')
  const [authIsResident, setAuthIsResident] = useState<boolean>(false) // Phase 6.1: 세대원 여부
  const [signupConsent, setSignupConsent] = useState<boolean>(false)

  // ===== localStorage 세션 관리 =====
  
  useEffect(() => {
    // 페이지 로드 시 세션 복원
    const savedSession = localStorage.getItem('oneumSession')
    if (savedSession) {
      const session = JSON.parse(savedSession)
      // 구버전 세션에 isResident 없으면 household로 대체
      if (session.isResident === undefined) {
        session.isResident = !!session.household
      }
      setUserSession(session)
      console.log('✅ 세션 복원:', session)
    }
  }, [])

  // ===== KST 시계 =====
  // 슬롯 경계가 :00 / :30 이라 30초 주기면 최대 오차가 30초다.
  useEffect(() => {
    const timer = setInterval(() => setKstNow(getKstNow()), 30_000)
    return () => clearInterval(timer)
  }, [])

  // 모달을 열어둔 채 시간이 흘러 슬롯이 시작돼 버린 경우, 선택에서 자동으로 뺀다.
  // (변화가 없으면 같은 배열을 그대로 돌려줘야 30초마다 하위 컴포넌트가 재계산되지 않는다)
  useEffect(() => {
    if (!isBookingModalOpen || selectedDate === null) return
    if (dateStrOf(selectedDate) !== kstNow.dateStr) return
    setSelectedTimes(prev => {
      const kept = prev.filter(t => timeToMinutes(t) > kstNow.minutes)
      return kept.length === prev.length ? prev : kept
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kstNow, isBookingModalOpen, selectedDate, currentMonth])

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

  // 예약 모달을 열 때 달력 데이터를 다시 읽는다.
  // 지금까지 목록은 currentMonth / selectedSpace 가 바뀔 때만 갱신됐다. 탭을 열어둔 채
  // 다른 사람이 예약하면 그 슬롯이 계속 비어 보였고, 서버에도 중복 검사가 없어 그대로 통과했다.
  // (2026-09-04 놀터 19시 더블부킹의 경로)
  // 이것으로 경합 자체가 사라지지는 않는다 — 최종 보증은 DB 의 bookings_no_overlap 제약이 한다.
  useEffect(() => {
    if (isBookingModalOpen) loadBookings()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isBookingModalOpen])

  // Phase 8: 세대 놀터 무료 사용 시간 조회 (세대원 + 놀터 모달 오픈 시)
  useEffect(() => {
    if (isBookingModalOpen && userSession.isResident && selectedSpace === 'nolter' && userSession.household) {
      setNolterQuota(null)
      // 한도는 '사용일이 속한 달' 기준이므로, 현재 보고 있는(예약하려는) 달로 조회한다.
      const targetMonth = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
      getHouseholdNolterQuota(userSession.household, targetMonth).then(result => {
        if (result.success) setNolterQuota(result)
      })
    }
  }, [isBookingModalOpen, selectedSpace, userSession.isResident, userSession.household, currentMonth])

  // setBookingsData 는 비동기라 호출 직후엔 state 가 아직 옛 값이다.
  // 갱신하자마자 결과를 봐야 하는 곳(SLOT_TAKEN 복구)을 위해 읽어온 배열을 그대로 반환한다.
  async function loadBookings(): Promise<any[]> {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth() + 1
    console.log('📥 예약 데이터 로드 중...')
    const result = await getBookings(year, month, selectedSpace)
    if (result.success) {
      setBookingsData(result.data)
      console.log('✅ 예약 데이터 로드 완료:', result.data.length, '건')
      return result.data
    }
    console.error('❌ 예약 데이터 로드 실패:', result.error)
    return bookingsData
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
  
  const timeSlots: string[] = []
  for (let h = 9; h <= 21; h++) {
    timeSlots.push(`${String(h).padStart(2, '0')}:00`)
    if (h < 21) timeSlots.push(`${String(h).padStart(2, '0')}:30`)
  }
  
  const households = ['201', '202', '301', '302', '401', '402', '501']

  // 달력에 그려진 '일(1~31)' → 'YYYY-MM-DD'
  const dateStrOf = (date: number): string =>
    toDateString(currentMonth.getFullYear(), currentMonth.getMonth() + 1, date)

  // 온음 세대원만 당일 예약이 가능하다. 실제 강제는 서버(app/actions/bookings.ts)가 한다.
  const userKind = resolveUserKind({
    userId: userSession.userId,
    isResident: userSession.isResident,
    household: userSession.household,
  })
  const isResidentUser = userKind === 'resident'

  /** 아직 시작하지 않은 시간대인가 (당일이면 현재 KST 시각 기준) */
  const isSlotBookableNow = (time: string, dateStr: string): boolean =>
    dateStr > kstNow.dateStr ||
    (dateStr === kstNow.dateStr && timeToMinutes(time) > kstNow.minutes)

  /** 오늘 아직 예약할 수 있는 시간대가 남아있는가 */
  const hasBookableSlotToday = (booked: Record<string, string>): boolean =>
    timeSlots.some(t => timeToMinutes(t) > kstNow.minutes && !(t in booked))

  // ===== 월 네비게이션 함수 =====
  
  // 일자를 항상 1로 고정해 생성한다. setMonth 로 옮기면 currentMonth 가 들고 있던 일자가
  // 짧은 달에서 넘쳐 달이 통째로 건너뛴다 (3/31 에서 이전 달 → 2/31 → 3/3).
  // Date 생성자는 month 가 -1 이거나 12 여도 연도 넘김을 알아서 처리한다.
  const goToPrevMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1)
    setCurrentMonth(newMonth)
    console.log('📅 이전 달:', newMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' }))
  }

  const goToNextMonth = () => {
    const newMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1)
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
    const dateStr = dateStrOf(date)

    const dayBookings = bookingsData.filter(b => b.booking_date === dateStr && b.space === selectedSpace)
    
    if (dayBookings.length === 0) return { status: 'available', count: 0 }
    
    // 예약된 시간 슬롯 수 계산
    const totalSlots = timeSlots.length
    const bookedSlots = dayBookings.length
    
    if (bookedSlots >= totalSlots) return { status: 'full', count: bookedSlots }
    return { status: 'partial', count: bookedSlots }
  }

  // ===== 해당 날짜에 예약된 시간대 조회 =====
  
  // 달력 렌더 중에도 호출되므로(오늘 셀 판정) 로그를 남기지 않는다.
  // source 를 주입할 수 있게 열어 둔다. 기본값은 화면이 보고 있는 state 지만,
  // 방금 서버에서 받아온 배열로 즉시 계산해야 하는 경우가 있다(SLOT_TAKEN 복구).
  const getBookedTimesForDate = (
    date: number,
    source: any[] = bookingsData
  ): Record<string, string> => {
    const dateStr = dateStrOf(date)

    const dayBookings = source.filter(b => b.booking_date === dateStr && b.space === selectedSpace)

    // 각 예약의 start_time부터 end_time까지 모든 30분 슬롯 추출 (시간 → 예약자 이름)
    const bookedTimes: Record<string, string> = {}
    dayBookings.forEach(booking => {
      const start = booking.start_time.substring(0, 5) // "14:00:00" → "14:00"
      const end = booking.end_time.substring(0, 5)

      const [startH, startM] = start.split(':').map(Number)
      const [endH, endM] = end.split(':').map(Number)
      let startMinutes = startH * 60 + startM
      let endMinutes = endH * 60 + endM

      // ⭐ FIX: start_time == end_time일 때 30분으로 처리
      if (endMinutes === startMinutes) {
        endMinutes = startMinutes + 30
      }

      for (let m = startMinutes; m < endMinutes; m += 30) {
        const timeSlot = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
        if (!(timeSlot in bookedTimes)) {
          bookedTimes[timeSlot] = booking.name || '예약됨'
        }
      }
    })

    return bookedTimes
  }


  // ===== 과거 / 오늘 날짜 확인 (KST 기준) =====
  // 'YYYY-MM-DD' 는 사전순 = 시간순이라 문자열 비교로 충분하다.
  // 브라우저 로컬 시간을 쓰면 해외/여행 중인 사용자의 '오늘'이 서버와 어긋난다.

  const isPastDate = (date: number): boolean => dateStrOf(date) < kstNow.dateStr

  const isToday = (date: number): boolean => dateStrOf(date) === kstNow.dateStr

  // ===== 해당 날짜의 총 예약 시간 계산 =====

  const getTotalHoursForDate = (date: number): number => {
    const dateStr = dateStrOf(date)

    const dayBookings = bookingsData.filter(b => b.booking_date === dateStr && b.space === selectedSpace)
    
    // 각 예약의 시간 합계 (30분 단위)
    const totalMinutes = dayBookings.reduce((sum, booking) => {
      const start = booking.start_time.substring(0, 5) // "14:00:00" → "14:00"
      const end = booking.end_time.substring(0, 5)

      const [startH, startM] = start.split(':').map(Number)
      const [endH, endM] = end.split(':').map(Number)
      let startMinutes = startH * 60 + startM
      let endMinutes = endH * 60 + endM

      // start_time == end_time일 때 30분으로 처리
      if (endMinutes === startMinutes) {
        endMinutes = startMinutes + 30
      }

      return sum + (endMinutes - startMinutes)
    }, 0)

    return totalMinutes / 60
  }

  // ===== 날짜 클릭 핸들러 =====
  
  const handleDateClick = (date: number) => {
    const dateStr = dateStrOf(date)

    // 마감된 날짜는 미래여도 예약 불가 (조회는 가능).
    // 과거/당일은 여기서 막지 않는다 — 조회는 항상 열어두고, 예약 가능 여부는 viewOnlyReason 이 판단한다.
    if (dateStr > kstNow.dateStr && getBookingStatus(date).status === 'full') {
      console.log(`⛔ 마감된 날짜 클릭 차단: ${date}일`)
      return
    }

    setSelectedDate(date)
    setSelectedTimes([])

    // ⭐ 예약된 시간 조회
    const times = getBookedTimesForDate(date)
    setBookedTimes(times)

    console.log(`🔍 DEBUG: ${date}일 예약 시간:`, times)

    if (dateStr >= kstNow.dateStr) {
      // 로그인 상태면 사용자 정보 자동 입력 + 선불권 조회 (세대원은 당일도 예약할 수 있다)
      if (userSession.isLoggedIn) {
        setName(userSession.name)
        setPhone(userSession.phone)
        loadPrepaidPurchases()
      } else {
        setName('')
        setPhone('')
      }
    }

    setIsBookingModalOpen(true)
    console.log(`📌 날짜 선택: ${dateStr}`)
  }

  // ===== 시간 선택 핸들러 (다중 선택) =====

  /** 정렬된 슬롯 배열이 30분 간격으로 끊김 없이 이어지는가 */
  const isContiguous = (times: string[]): boolean =>
    times.every((t, i) => i === 0 || timeToMinutes(t) === timeToMinutes(times[i - 1]) + 30)

  /**
   * 끊긴 선택에서 가장 긴 연속 구간만 남긴다 (길이가 같으면 이른 쪽).
   * 예약 한 건은 연속 구간 하나로만 저장되므로, 어중간하게 끊긴 선택을 들고 있으면
   * 서버가 거절하거나 사이 시간대가 통째로 잠긴다.
   */
  const longestContiguousRun = (times: string[]): string[] => {
    let best: string[] = []
    let run: string[] = []

    for (const t of times) {
      if (run.length === 0 || timeToMinutes(t) === timeToMinutes(run[run.length - 1]) + 30) {
        run.push(t)
      } else {
        run = [t]
      }
      if (run.length > best.length) best = [...run]
    }

    return best
  }


  const handleTimeToggle = (time: string) => {
    // 다음 30분 슬롯 계산
    const [h, m] = time.split(':').map(Number)
    const nextMinutes = h * 60 + m + 30
    const nextTime = `${String(Math.floor(nextMinutes / 60)).padStart(2, '0')}:${String(nextMinutes % 60).padStart(2, '0')}`

    // 이전 30분 슬롯 계산
    const prevMinutes = h * 60 + m - 30
    const prevTime = prevMinutes >= 0
      ? `${String(Math.floor(prevMinutes / 60)).padStart(2, '0')}:${String(prevMinutes % 60).padStart(2, '0')}`
      : null

    setSelectedTimes(prev => {
      if (prev.includes(time)) {
        // 선택 취소: 클릭한 슬롯 + 이전/다음 30분 슬롯 모두 제거 (페어 처리)
        // 가운데를 해제하면 양쪽이 끊겨 남으므로 연속 구간 하나만 남긴다.
        return longestContiguousRun(
          prev.filter(t => t !== time && t !== nextTime && t !== prevTime).sort()
        )
      }

      // 선택: 클릭한 슬롯 + 다음 30분 슬롯 함께 추가
      const merged = Array.from(new Set([...prev, time, nextTime])).sort()

      // 한 건의 예약은 [start, end) 구간 하나로 저장된다. 떨어진 슬롯을 함께 고르면
      // 14:00 과 20:00 이 '14:00~20:30 2시간'으로 저장돼 그 사이가 통째로 잠긴다.
      // 그래서 기존 선택과 이어지지 않는 슬롯을 누르면 거기서부터 새로 고르게 한다.
      return isContiguous(merged) ? merged : [time, nextTime]
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
      if (!nonMemberConsent) {
        alert('개인정보 수집·이용에 동의해 주세요.')
        return
      }
    }

    const bookingDate = dateStrOf(selectedDate as number)

    // 예약 데이터 생성
    const bookingInput: CreateBookingInput = {
      bookingDate,
      times: selectedTimes,
      space: selectedSpace,
      memberType: (userSession.isLoggedIn && userSession.isResident) ? 'member' as const : 'non-member' as const,
      household: userSession.isLoggedIn ? userSession.household : undefined,
      name: userSession.isLoggedIn ? userSession.name : name,  // ⭐ Phase 6.5: 로그인 사용자는 세션 정보 사용
      phone: userSession.isLoggedIn ? userSession.phone : phone, // ⭐ Phase 6.5: 로그인 사용자는 세션 정보 사용
      userId: userSession.userId, // ⭐ Phase 6.5: 선불권 사용을 위한 userId 전달
      consentGiven: userSession.isLoggedIn ? true : nonMemberConsent,
      isLoggedIn: userSession.isLoggedIn,
      isResident: !!userSession.isResident,
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
      console.log('시간:', selectedTimes.join(', '), `(총 ${selectedTimes.length * 0.5}시간)`)
      console.log('공간:', selectedSpace === 'nolter' ? '놀터' : '방음실')
      console.log('예약자:', userSession.isLoggedIn ? `${userSession.household}호 ${name}` : name)
      console.log('연락처:', phone)

      // Phase 8: 무료 / 선불권 / 현금 내역 안내 (서버가 확정한 값 기준)
      const booked = result.data
      const freeHoursUsed = Number(booked?.free_hours_used ?? 0)
      const prepaidHoursUsed = Number(booked?.prepaid_hours_used ?? 0)
      const regularHours = Number(booked?.regular_hours ?? 0)
      const amount = Number(booked?.amount ?? 0)

      const lines: string[] = []
      if (freeHoursUsed > 0) lines.push(`🎟 세대 무료 ${formatHours(freeHoursUsed)} 사용`)
      if (prepaidHoursUsed > 0) lines.push(`🎫 선불권 ${formatHours(prepaidHoursUsed)} 사용`)
      if (booked?.payment_method === 'nolter_paid') {
        // 구 정책(7월까지): 무료 횟수 초과 시 이용 시간과 무관한 정액
        lines.push(`💰 무료 횟수 초과 — ${amount.toLocaleString()}원 (시간 무관)`)
      } else if (regularHours > 0) {
        lines.push(`💳 현금 결제 ${formatHours(regularHours)} (${amount.toLocaleString()}원)`)
      }

      let paymentInfo = lines.length > 0 ? `\n\n${lines.join('\n')}` : ''
      if (amount > 0) {
        paymentInfo += `\n계좌: 카카오뱅크 7979-72-56275 (정상은)\n예약자명으로 입금해주세요.`
      }

      alert(`예약이 완료되었습니다!\n\n날짜: ${month}월 ${selectedDate}일\n시간: ${selectedTimes.join(', ')} (총 ${selectedTimes.length * 0.5}시간)\n공간: ${selectedSpace === 'nolter' ? '놀터' : '방음실'}${paymentInfo}`)
      setIsBookingModalOpen(false)
      setNonMemberConsent(false)

      // 예약 목록 새로고침
      loadBookings()

      // 선불권 사용한 경우 선불권 목록도 새로고침
      if (prepaidHoursUsed > 0) {
        loadPrepaidPurchases()
      }

      // 세대원 놀터 예약이면 한도 배지를 갱신한다.
      // (구 정책은 건수 기준이라 free_hours_used가 0이므로 시간만 보고 판단할 수 없다)
      if (userSession.isResident && selectedSpace === 'nolter' && userSession.household) {
        const targetMonth = `${currentMonth.getFullYear()}-${String(currentMonth.getMonth() + 1).padStart(2, '0')}`
        getHouseholdNolterQuota(userSession.household, targetMonth).then(res => {
          if (res.success) setNolterQuota(res)
        })
      }
    } else {
      console.error('❌ 예약 실패:', result.error)

      if (result.code === 'SLOT_TAKEN') {
        // 내 화면이 낡아서 생긴 실패다. 달력을 다시 읽고, 그 사이 남이 가져간 슬롯만 선택에서 뺀다.
        // 전부 지우지 않는 이유: 19~21시를 고른 뒤 19~20시만 뺏긴 경우 20~21시는 아직 유효하고,
        // 그것까지 지우면 사용자가 처음부터 다시 골라야 한다.
        const fresh = await loadBookings()
        const taken = getBookedTimesForDate(selectedDate as number, fresh)
        // 가운데 슬롯만 뺏기면 남은 선택이 끊긴다. 그대로 두면 재시도가 무조건 실패하므로
        // (한 건은 연속 구간 하나로만 저장된다) 이어지는 구간 하나만 남긴다.
        const survivors = longestContiguousRun(selectedTimes.filter(t => !(t in taken)).sort())
        setSelectedTimes(survivors)

        alert(
          survivors.length > 0
            ? `${result.error}\n\n남은 시간(${survivors.join(', ')})은 그대로 선택해 두었습니다. 확인 후 다시 예약해주세요.`
            : `${result.error}\n\n달력을 갱신했습니다. 다른 시간을 선택해주세요.`
        )
        return
      }

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
    
    if (!authPhone.trim()) {
      alert('전화번호를 입력해주세요.')
      return
    }
    if (!authPassword.trim()) {
      alert('비밀번호를 입력해주세요.')
      return
    }

    try {
      const result = await login({
        phone: authPhone,
        password: authPassword
      })
      console.log('📥 [LOGIN] API 응답:', result)

      if (!result.success) {
        console.error('❌ [LOGIN] 로그인 실패:', result.error)
        alert(result.error)
        return
      }

      const loginUser = (result as unknown as { user: { id: string; household: string; name: string; phone: string; is_admin: boolean; is_resident: boolean } }).user

      // 세션 저장 (세대 정보 + 관리자 권한 자동 포함!)
      const session: UserSession = {
        isLoggedIn: true,
        household: loginUser.household,
        name: loginUser.name,
        phone: loginUser.phone,
        isAdmin: loginUser.is_admin || false,
        userId: loginUser.id,
        isResident: loginUser.is_resident || !!loginUser.household
      }

      saveSession(session)
      setIsAuthModalOpen(false)
      alert(`${loginUser.name}님 로그인되었습니다!`)
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

    if (!signupConsent) {
      alert('개인정보 수집·이용에 동의해 주세요.')
      return
    }

    const result = await signup({
      household: authIsResident ? authHousehold : '', // 세대원이 아니면 빈 문자열
      name: authName,
      phone: authPhone,
      password: authPassword,
      isResident: authIsResident, // Phase 6.1: 세대원 여부 추가
      consentGiven: signupConsent,
    })

    if (!result.success) {
      alert(result.error)
      return
    }

    alert('회원가입 신청이 되었습니다.\n관리자가 승인한 이후에 로그인 가능합니다.')
    setSignupConsent(false)
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
    if (userSession.isLoggedIn) {
      setIsLoadingBookings(true)
      try {
        const result = userSession.household?.trim()
          ? await getBookingsByHousehold(userSession.household)
          : userSession.userId
            ? await getBookingsByUserId(userSession.userId)
            : { success: false, data: [], error: '사용자 정보 없음' }
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
  // 선택한 사용일. 적용 정책(7월까지 구 규정 / 8월부터 신 규정)을 가르는 기준이다.
  const selectedBookingDate = toDateString(year, month + 1, selectedDate ?? 1)
  // null = 빈 칸, number = 날짜
  const calendarCells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  // ===== 조회 전용 모드 판정 =====
  // state 로 들고 있으면 30초 틱 뒤에 낡는다 (20:58에 연 세대원 모달이 21:00에 조회 전용이 되어야 한다).
  // 그래서 매 렌더마다 다시 계산한다.
  const viewOnlyReason: null | 'past' | 'non-resident-today' | 'today-slots-gone' =
    !selectedDate
      ? null
      : selectedBookingDate < kstNow.dateStr
      ? 'past'
      : selectedBookingDate > kstNow.dateStr
      ? null
      : !isResidentUser
      ? 'non-resident-today'
      : !hasBookableSlotToday(bookedTimes)
      ? 'today-slots-gone'
      : null
  const isViewOnlyMode = viewOnlyReason !== null

  // 세대원에게만 '당일 예약 가능' 문구를 보여준다.
  // DB(site_settings)는 사용자 구분 없이 한 벌만 저장하므로 렌더 시점에 갈아끼운다.
  const bookingRules = generalRules
    ? isResidentUser
      ? [
          RESIDENT_SAME_DAY_RULE,
          ...generalRules.booking.filter(rule => !rule.includes(SAME_DAY_RULE_MARKER)),
        ]
      : generalRules.booking
    : []

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-8">
      <div className="max-w-4xl mx-auto">
        {/* ===== 헤더 ===== */}
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-2">온음 공간 예약</h1>
            <p className="text-base sm:text-lg text-gray-600">놀터 & 방음실 예약 시스템</p>
            <a href="/guide" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mt-1.5 font-medium">
              📖 처음이신가요? 이용 가이드 보기
            </a>
          </div>
          
          {/* 우측 버튼들 */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
            {userSession.isLoggedIn ? (
              <>
                <div className="text-left sm:text-right mr-0 sm:mr-3">
                  {userSession.isResident && userSession.household?.trim() && (
                    <p className="text-xs sm:text-sm font-semibold text-gray-900">{userSession.household}호</p>
                  )}
                  <p className="text-sm font-medium text-gray-700">{userSession.name}</p>
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

          {/* 예약 안내 문구 — 세대원에게만 당일 예약 안내를 보여준다 */}
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
            <p className="text-sm font-semibold text-blue-800">
              {isResidentUser ? 'ℹ️ 온음 세대원은 당일 예약이 가능합니다' : '⚠️ 예약은 최소 1일 전까지 가능합니다'}
            </p>
            <p className="text-xs text-blue-600 mt-1">
              {isResidentUser
                ? '오늘 날짜는 아직 시작하지 않은 시간대만 선택할 수 있습니다.'
                : '당일 예약은 불가능하며, 내일부터 선택 가능합니다.'}
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
              const isTodayDate = isToday(date)
              // 세대원은 오늘도 아직 시작하지 않은 '빈' 시간대가 남아있으면 예약할 수 있다.
              // 모달의 today-slots-gone 판정과 같은 함수를 써야 셀과 모달이 어긋나지 않는다.
              const todayIsBookable =
                isTodayDate && isResidentUser && hasBookableSlotToday(getBookedTimesForDate(date))
              const looksUnbookable = isPast || (isTodayDate && !todayIsBookable)

              return (
                <div key={date} className="flex flex-col items-center gap-1">
                  {/* 날짜 박스 */}
                  <button
                    onClick={() => handleDateClick(date)}
                    className={`w-full aspect-square rounded-xl p-2 transition-all ${
                      looksUnbookable
                        ? 'opacity-60 cursor-pointer bg-gray-100 border-2 border-gray-300 hover:border-gray-400'
                        :
                      bookingStatus.status === 'full'
                        ? 'bg-gray-100 border-2 border-gray-400 cursor-not-allowed'
                        : totalHours > 0
                        ? 'bg-blue-100 border-2 border-blue-400 hover:bg-blue-200'
                        : 'bg-white border-2 border-gray-200 hover:bg-blue-50 hover:border-blue-400'
                    }`}
                    disabled={false}
                  >
                    {/* 날짜 + 시간 레이아웃 */}
                    <div className="flex flex-col items-center justify-center h-full">
                      {/* 날짜 */}
                      <div className={`text-sm font-semibold ${
                        isTodayDate ? 'text-blue-600' : 'text-gray-700'
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
                  {bookingRules.map((rule, index) => (
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
          <div className="mt-4">
            <a href="/inquiry" className="inline-block bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg px-5 py-3 text-center transition-colors">
              <p className="text-amber-700 text-xs mb-1">기타 문의사항이나 오류 발생시 여기를 이용해주세요</p>
              <p className="text-amber-900 font-semibold text-sm">📬 문의 게시판 →</p>
            </a>
          </div>
        </div>
      </div>

      {/* ===== 예약 모달 ===== */}
      {isBookingModalOpen && selectedDate !== null && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={() => { setIsBookingModalOpen(false); setNonMemberConsent(false) }}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                {isViewOnlyMode
                  ? `${selectedSpace === 'nolter' ? '🏠 놀터' : '🎵 방음실'} 예약 현황 — ${month + 1}월 ${selectedDate}일`
                  : `${selectedSpace === 'nolter' ? '🏠 놀터' : '🎵 방음실'} 예약하기 — ${month + 1}월 ${selectedDate}일`}
              </h2>
              <button
                onClick={() => { setIsBookingModalOpen(false); setNonMemberConsent(false) }}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-6">
              {/* 조회 모드 안내 */}
              {viewOnlyReason && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-sm text-gray-500">
                    {viewOnlyReason === 'past'
                      ? '지난 날짜는 조회만 가능합니다.'
                      : viewOnlyReason === 'today-slots-gone'
                      ? '오늘 예약 가능한 시간대가 모두 지났습니다. 조회만 가능합니다.'
                      : '과거/당일 날짜는 조회만 가능합니다.'}
                  </p>
                </div>
              )}
              {/* 시간 선택 (다중) */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  {isViewOnlyMode ? '시간대별 예약 현황' : '시간 선택 * (연속 시간 선택 가능)'}
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map(time => {
                    const isBooked = time in bookedTimes
                    const isSelected = selectedTimes.includes(time)
                    const bookerName = bookedTimes[time] || '예약됨'
                    const isMember = userSession.isLoggedIn && (!!userSession.isResident || !!userSession.household)
                    // 당일 예약(세대원)에서 이미 시작된 시간대
                    const isPastSlot = !isSlotBookableNow(time, selectedBookingDate)

                    return (
                      <button
                        key={time}
                        onClick={() => !isViewOnlyMode && !isBooked && !isPastSlot && handleTimeToggle(time)}
                        disabled={isBooked || isViewOnlyMode || isPastSlot}
                        className={`py-3 px-4 rounded-lg border font-medium transition-colors ${
                          isBooked
                            ? 'bg-gray-200 text-gray-400 border-gray-300 cursor-not-allowed'
                            : isPastSlot
                            ? 'bg-gray-50 text-gray-300 border-gray-200 line-through cursor-not-allowed'
                            : isSelected
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                        }`}
                      >
                        <div>{time}</div>
                        {isBooked ? (
                          <div className="text-xs mt-1">
                            {isMember ? bookerName : '예약됨'}
                          </div>
                        ) : isPastSlot && !isViewOnlyMode ? (
                          <div className="text-xs mt-1">지난 시간</div>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
                {!isViewOnlyMode && selectedBookingDate === kstNow.dateStr && (
                  <p className="mt-3 text-xs text-gray-500">
                    현재 {kstNow.hhmm} (KST) — 이미 시작된 시간대는 선택할 수 없습니다.
                    <br />
                    당일 예약은 무료 시간·선불권 범위 내에서만 가능합니다.
                  </p>
                )}
                {selectedTimes.length > 0 && (
                  <p className="mt-3 text-sm text-blue-600 font-medium">
                    총 {selectedTimes.length * 0.5}시간 선택됨: {selectedTimes.join(', ')}
                  </p>
                )}
              </div>

              {/* 예약 폼 (조회 모드에서는 숨김) */}
              {!isViewOnlyMode && (userSession.isLoggedIn ? (
                <div className="space-y-4">
                  {/* Phase 8: 세대 무료 시간 + 선불권 + 현금 통합 안내 */}
                  <BookingChargeSummary
                    userKind={userKind}
                    space={selectedSpace}
                    bookingDate={selectedBookingDate}
                    selectedSlotCount={selectedTimes.length}
                    quota={nolterQuota}
                    prepaidPurchases={prepaidPurchases as unknown as PrepaidLike[]}
                    monthLabel={month + 1}
                  />


                  {userSession.isResident && userSession.household?.trim() && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-3">
                        세대 정보
                      </label>
                      <div className="py-3 px-4 bg-gray-100 rounded-lg text-gray-700">
                        {userSession.household}호
                      </div>
                    </div>
                  )}
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
                      💡 <strong>앞으로 계속 대관하실 생각이시면</strong>{' '}
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
                      placeholder="01000000000"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                  {/* 개인정보 수집·이용 동의 */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <label className="flex items-start gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={nonMemberConsent}
                        onChange={(e) => setNonMemberConsent(e.target.checked)}
                        className="mt-0.5 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                      />
                      <span className="text-sm text-gray-700">
                        <span className="font-semibold text-gray-900">[필수] 개인정보 수집·이용 동의</span>
                        <br />
                        <span className="text-xs text-gray-500">수집 항목: 이름, 전화번호 / 수집 목적: 예약 확인 및 안내 문자 발송 / 보유 기간: 예약 종료 후 1년</span>
                      </span>
                    </label>
                  </div>
                  {/* ⭐ 비회원 결제 안내 */}
                  {!userSession.isLoggedIn && (
                    <div className="mt-4">
                      <BookingChargeSummary
                        userKind="guest"
                        space={selectedSpace}
                        bookingDate={selectedBookingDate}
                        selectedSlotCount={selectedTimes.length}
                        quota={null}
                        prepaidPurchases={[]}
                        monthLabel={month + 1}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 모달 푸터 */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
              {isViewOnlyMode ? (
                <button
                  onClick={() => { setIsBookingModalOpen(false); setNonMemberConsent(false) }}
                  className="w-full py-4 text-white font-semibold rounded-lg transition-colors bg-gray-500 hover:bg-gray-600"
                >
                  확인
                </button>
              ) : (
                <button
                  onClick={handleBookingSubmit}
                  disabled={isSubmitting || (!userSession.isLoggedIn && !nonMemberConsent)}
                  className={`w-full py-4 text-white font-semibold rounded-lg transition-colors ${isSubmitting || (!userSession.isLoggedIn && !nonMemberConsent) ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
                >
                  {isSubmitting ? '예약 중...' : '예약하기'}
                </button>
              )}
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
                      placeholder="01000000000"
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

                  {/* 전화번호 (로그인 + 회원가입 공통) */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">
                      전화번호 *
                    </label>
                    <input
                      type="tel"
                      value={authPhone}
                      onChange={(e) => setAuthPhone(e.target.value)}
                      placeholder="01000000000"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* 회원가입: 이름 */}
                  {authMode === 'signup' && (
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

                  {/* 회원가입: 개인정보 수집·이용 동의 */}
                  {authMode === 'signup' && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={signupConsent}
                          onChange={(e) => setSignupConsent(e.target.checked)}
                          className="mt-0.5 w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 flex-shrink-0"
                        />
                        <span className="text-sm text-gray-700">
                          <span className="font-semibold text-gray-900">[필수] 개인정보 수집·이용 동의</span>
                          <br />
                          <span className="text-xs text-gray-500">수집 항목: 이름, 전화번호 / 수집 목적: 예약 확인 및 안내 문자 발송 / 보유 기간: 회원 탈퇴 후 1년</span>
                        </span>
                      </label>
                    </div>
                  )}

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
                    disabled={authMode === 'signup' && !signupConsent}
                    className={`w-full py-3 text-white font-semibold rounded-lg transition-colors ${authMode === 'signup' && !signupConsent ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-500 hover:bg-blue-600'}`}
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
                      {userSession.isResident && userSession.household?.trim() ? `${userSession.household}호 ` : ''}{userSession.name}님
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
                      placeholder="01000000000"
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
