export default function Home() {
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
    </div>
  )
}
