'use client'

import { useState } from 'react'

export default function Home() {
  // State 관리
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<number | null>(null)
  const [selectedTime, setSelectedTime] = useState<string>('')
  const [memberType, setMemberType] = useState<'member' | 'non-member'>('member')
  const [household, setHousehold] = useState<string>('')
  const [name, setName] = useState<string>('')
  const [phone, setPhone] = useState<string>('')

  // 시간대 목록 (09:00 ~ 23:00, 1시간 간격)
  const timeSlots = Array.from({ length: 15 }, (_, i) => {
    const hour = i + 9
    return `${hour.toString().padStart(2, '0')}:00`
  })

  // 세대 목록
  const households = ['201', '301', '302', '401', '402', '501']

  // 날짜 클릭 핸들러
  const handleDateClick = (date: number) => {
    setSelectedDate(date)
    setIsModalOpen(true)
    // 모달 열 때마다 초기화
    setSelectedTime('')
    setMemberType('member')
    setHousehold('')
    setName('')
    setPhone('')
  }

  // 모달 닫기
  const handleCloseModal = () => {
    setIsModalOpen(false)
  }

  // 예약하기
  const handleSubmit = () => {
    // 폼 검증
    if (!selectedTime) {
      alert('시간을 선택해주세요.')
      return
    }

    if (memberType === 'member' && !household) {
      alert('세대를 선택해주세요.')
      return
    }

    if (memberType === 'non-member') {
      if (!name.trim()) {
        alert('이름을 입력해주세요.')
        return
      }
      if (!phone.trim()) {
        alert('전화번호를 입력해주세요.')
        return
      }
    }

    // 예약 정보 출력
    console.log('=== 예약 정보 ===')
    console.log('날짜:', `2026년 3월 ${selectedDate}일`)
    console.log('시간:', selectedTime)
    console.log('회원 구분:', memberType === 'member' ? '회원' : '비회원')
    if (memberType === 'member') {
      console.log('세대:', household)
    } else {
      console.log('이름:', name)
      console.log('전화번호:', phone)
    }

    // 예약 완료 알림 및 모달 닫기
    alert('예약이 완료되었습니다!')
    handleCloseModal()
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">온음 공간 예약</h1>
          <p className="text-gray-600">놀터 & 방음실 예약 시스템</p>
        </div>

        {/* 탭 */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex gap-4 mb-6">
            <button className="px-6 py-2 bg-blue-500 text-white rounded-lg font-medium">
              놀터
            </button>
            <button className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300">
              방음실
            </button>
          </div>

          {/* 달력 헤더 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-4">
              <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
                ← 이전
              </button>
              <h2 className="text-xl font-semibold">2026년 3월</h2>
              <button className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">
                다음 →
              </button>
            </div>
          </div>

          {/* 요일 */}
          <div className="grid grid-cols-7 gap-2 mb-2">
            {['일', '월', '화', '수', '목', '금', '토'].map(day => (
              <div key={day} className="text-center font-semibold text-gray-700 py-2">
                {day}
              </div>
            ))}
          </div>

          {/* 날짜 */}
          <div className="grid grid-cols-7 gap-2">
            {Array.from({ length: 31 }, (_, i) => (
              <button
                key={i + 1}
                onClick={() => handleDateClick(i + 1)}
                className="aspect-square border border-gray-200 rounded-lg p-2 hover:bg-blue-50 hover:border-blue-300 transition-colors"
              >
                <div className="text-sm font-medium">{i + 1}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 예약 안내 */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold mb-4">📋 예약 안내</h3>
          <div className="space-y-2 text-gray-700">
            <p>• <strong>운영시간:</strong> 09:00 - 23:00</p>
            <p>• <strong>회원:</strong> 월 3회 무료</p>
            <p>• <strong>비회원:</strong> 14,000원/시간 (24시간 전 예약)</p>
            <p>• <strong>입금계좌:</strong> 카카오뱅크 7979-72-56275 (정상은)</p>
          </div>
        </div>

        {/* 푸터 */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>온음 공동체 공간 예약 시스템</p>
        </div>
      </div>

      {/* 예약 모달 */}
      {isModalOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
          onClick={handleCloseModal}
        >
          <div 
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">
                예약하기 - 3월 {selectedDate}일
              </h2>
              <button 
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 text-3xl leading-none"
              >
                ×
              </button>
            </div>

            {/* 모달 본문 */}
            <div className="p-6 space-y-6">
              {/* 시간 선택 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  시간 선택 *
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {timeSlots.map(time => (
                    <button
                      key={time}
                      onClick={() => setSelectedTime(time)}
                      className={`py-3 px-4 rounded-lg border font-medium transition-colors ${
                        selectedTime === time
                          ? 'bg-blue-500 text-white border-blue-500'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                      }`}
                    >
                      {time}
                    </button>
                  ))}
                </div>
              </div>

              {/* 회원 구분 */}
              <div>
                <label className="block text-sm font-semibold text-gray-900 mb-3">
                  회원 구분 *
                </label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setMemberType('member')}
                    className={`flex-1 py-3 px-6 rounded-lg border font-medium transition-colors ${
                      memberType === 'member'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    회원
                  </button>
                  <button
                    onClick={() => setMemberType('non-member')}
                    className={`flex-1 py-3 px-6 rounded-lg border font-medium transition-colors ${
                      memberType === 'non-member'
                        ? 'bg-blue-500 text-white border-blue-500'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300 hover:bg-blue-50'
                    }`}
                  >
                    비회원
                  </button>
                </div>
              </div>

              {/* 회원 선택 시 - 세대 선택 */}
              {memberType === 'member' && (
                <div>
                  <label className="block text-sm font-semibold text-gray-900 mb-3">
                    세대 선택 *
                  </label>
                  <select
                    value={household}
                    onChange={(e) => setHousehold(e.target.value)}
                    className="w-full py-3 px-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">세대를 선택하세요</option>
                    {households.map(h => (
                      <option key={h} value={h}>{h}호</option>
                    ))}
                  </select>
                </div>
              )}

              {/* 비회원 선택 시 - 이름/전화번호 입력 */}
              {memberType === 'non-member' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-3">
                      이름 *
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="이름을 입력하세요"
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                      className="w-full py-3 px-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 모달 푸터 */}
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 p-6">
              <button
                onClick={handleSubmit}
                className="w-full py-4 bg-blue-500 text-white font-semibold rounded-lg hover:bg-blue-600 transition-colors"
              >
                예약하기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
