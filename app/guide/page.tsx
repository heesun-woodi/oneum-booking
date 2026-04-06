'use client'

import Link from 'next/link'

export default function GuidePage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 헤더 */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-gray-800 text-sm">← 홈으로</Link>
          <h1 className="text-base font-bold text-gray-900">온음 이용 가이드</h1>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-10">

        {/* 인트로 */}
        <div className="text-center py-6">
          <p className="text-4xl mb-3">🎵</p>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">온음에 오신 걸 환영합니다</h2>
          <p className="text-gray-500 text-sm leading-relaxed">
            우리 공동체 공간을 편리하게 예약하고 이용하는 서비스입니다.<br />
            아래 가이드를 참고해 쉽게 시작해 보세요!
          </p>
        </div>

        {/* 섹션 1: 공간 소개 */}
        <section>
          <SectionTitle step="01" title="이용 가능한 공간" />
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <p className="text-3xl mb-2">🏠</p>
              <p className="font-bold text-gray-900 mb-1">놀터</p>
              <p className="text-xs text-gray-500 leading-relaxed">모임, 파티, 커뮤니티 라운지로 자유롭게 사용하는 공간</p>
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
              <p className="text-3xl mb-2">🎸</p>
              <p className="font-bold text-gray-900 mb-1">방음실</p>
              <p className="text-xs text-gray-500 leading-relaxed">악기 연습, 보컬 연습, 녹음 등 음악 활동을 위한 공간</p>
            </div>
          </div>

          {/* 공간 선택 UI 예시 */}
          <div className="mt-4 bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
            <p className="text-xs text-gray-400 mb-3 font-medium">화면 예시 — 공간 선택</p>
            <div className="flex gap-2">
              <div className="flex-1 bg-blue-500 text-white text-sm font-semibold rounded-xl py-3 text-center shadow">🏠 놀터</div>
              <div className="flex-1 bg-gray-100 text-gray-500 text-sm font-semibold rounded-xl py-3 text-center">🎸 방음실</div>
            </div>
          </div>
        </section>

        {/* 섹션 2: 이용 요금 */}
        <section>
          <SectionTitle step="02" title="이용 요금" />
          <div className="mt-4 bg-white border border-gray-200 rounded-2xl p-5">
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">✓</span><span><strong>놀터 / 방음실</strong> — 14,000원/시간</span></li>
              <li className="flex items-start gap-2"><span className="text-blue-400 mt-0.5">✓</span><span>30분 단위 예약 가능 (7,000원/30분)</span></li>
            </ul>
          </div>
        </section>

        {/* 섹션 3: 이용 순서 */}
        <section>
          <SectionTitle step="03" title="이용 순서" />
          <div className="mt-4 space-y-3">

            {/* Step 1: 회원가입 */}
            <StepCard
              num="1"
              icon="📝"
              title="회원가입 신청"
              desc="전화번호·이름·비밀번호를 입력해 가입 신청합니다."
            >
              <div className="mt-3 bg-gray-50 rounded-xl p-3 space-y-2">
                <p className="text-xs text-gray-400 font-medium mb-2">화면 예시 — 회원가입</p>
                <MockInput label="전화번호" placeholder="01012345678" />
                <MockInput label="이름" placeholder="홍길동" />
                <MockInput label="비밀번호" placeholder="••••••" />
                <div className="bg-blue-500 text-white text-xs font-semibold rounded-lg py-2 text-center mt-1">가입 신청하기</div>
              </div>
            </StepCard>

            {/* Step 2: 승인 */}
            <StepCard
              num="2"
              icon="✅"
              title="관리자 승인 대기"
              desc="가입 신청 후 관리자 승인이 완료되면 문자 알림이 발송됩니다. 승인 후 로그인이 가능합니다."
            >
              <div className="mt-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 font-medium mb-2">문자 예시</p>
                <div className="bg-white border border-gray-200 rounded-lg p-3 text-xs text-gray-700 leading-relaxed">
                  [온음] 홍길동님, 회원 가입이 승인되었습니다.<br />
                  로그인 후 바로 예약하실 수 있습니다. 🎵
                </div>
              </div>
            </StepCard>

            {/* Step 3: 예약 */}
            <StepCard
              num="3"
              icon="📅"
              title="예약하기"
              desc="날짜 → 공간 → 시간 순서로 선택한 뒤 예약하기를 누르세요. 30분 단위로 시간을 고를 수 있습니다."
            >
              <div className="mt-3 bg-gray-50 rounded-xl p-3">
                <p className="text-xs text-gray-400 font-medium mb-2">화면 예시 — 시간 선택</p>
                <div className="grid grid-cols-4 gap-1.5">
                  {['09:00','09:30','10:00','10:30','11:00','11:30','12:00','12:30'].map((t, i) => (
                    <div key={t} className={`text-xs text-center py-1.5 rounded-lg font-medium ${i === 2 || i === 3 ? 'bg-blue-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>{t}</div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2 text-center">클릭 한 번에 1시간(2슬롯) 자동 선택</p>
              </div>
            </StepCard>

            {/* Step 4: 입금 */}
            <StepCard
              num="4"
              icon="💰"
              title="입금"
              desc="예약 후 문자로 입금 안내가 발송됩니다. 예약일 전날까지 입금하지 않으면 자동 취소됩니다."
            >
              <div className="mt-3 bg-yellow-50 border border-yellow-100 rounded-xl p-3">
                <p className="text-xs font-semibold text-yellow-800 mb-1">입금 계좌</p>
                <p className="text-sm font-bold text-yellow-900">카카오뱅크 7979-72-56275</p>
                <p className="text-xs text-yellow-700">예금주: 정상은</p>
              </div>
            </StepCard>

            {/* Step 5: 이용 */}
            <StepCard
              num="5"
              icon="🎉"
              title="이용하기"
              desc="예약 당일 해당 공간을 이용하시면 됩니다. 이용 전날 리마인더 문자를 보내드립니다."
            />

          </div>
        </section>

        {/* 섹션 4: 선불권 */}
        <section>
          <SectionTitle step="04" title="선불권 (할인 상품)" />
          <div className="mt-4 bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
            <p className="text-sm text-gray-600 leading-relaxed mb-4">
              시간을 미리 구매해 두는 할인 상품입니다. 구매 후 관리자 입금 확인 시 즉시 활성화되며, 예약 시 자동으로 차감됩니다.
            </p>
            <div className="bg-purple-50 border border-purple-100 rounded-xl p-4">
              <p className="text-xs text-purple-500 font-medium mb-2">화면 예시 — 선불권 현황</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-500">잔여 시간</p>
                  <p className="text-2xl font-bold text-purple-600">8<span className="text-sm font-normal text-gray-500">시간</span></p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">만료일</p>
                  <p className="text-sm font-semibold text-gray-700">2026.12.31</p>
                </div>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-center">마이페이지 → 선불권 탭에서 확인</p>
          </div>
        </section>

        {/* 섹션 5: 취소 정책 */}
        <section>
          <SectionTitle step="05" title="예약 취소 정책" />
          <div className="mt-4 bg-white rounded-2xl shadow-sm p-5 border border-gray-100 space-y-3">
            <PolicyItem icon="✅" text="이용일 전날까지 취소 가능" />
            <PolicyItem icon="❌" text="취소된 예약은 복구 불가" />
            <PolicyItem icon="🔄" text="시간 변경: 취소 후 재예약" />
            <PolicyItem icon="💳" text="유료 예약 환불: 관리자에게 문의" />
          </div>
        </section>

        {/* 섹션 6: 마이페이지 */}
        <section>
          <SectionTitle step="06" title="마이페이지 활용" />
          <div className="mt-4 bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <p className="text-xs text-gray-400 font-medium px-4 pt-4 pb-2">화면 예시 — 마이페이지</p>
            <div className="px-4 pb-4 space-y-2">
              <MockTab label="예약 현황" active />
              <div className="bg-gray-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-gray-700">5월 10일 (토)</p>
                <p className="text-xs text-gray-500 mt-0.5">14:00 ~ 16:00 · 방음실</p>
                <div className="mt-2 flex justify-between items-center">
                  <span className="text-xs bg-green-100 text-green-700 font-medium px-2 py-0.5 rounded-full">예약 완료</span>
                  <span className="text-xs text-red-400 font-medium">예약 취소</span>
                </div>
              </div>
            </div>
          </div>
          <ul className="mt-3 space-y-1.5 px-1">
            <li className="flex items-start gap-2 text-sm text-gray-600"><span className="text-blue-400">•</span>예약 현황 확인 및 취소</li>
            <li className="flex items-start gap-2 text-sm text-gray-600"><span className="text-blue-400">•</span>지난 예약 내역 조회</li>
            <li className="flex items-start gap-2 text-sm text-gray-600"><span className="text-blue-400">•</span>선불권 잔여 시간 확인</li>
            <li className="flex items-start gap-2 text-sm text-gray-600"><span className="text-blue-400">•</span>비밀번호 변경</li>
          </ul>
        </section>

        {/* CTA */}
        <div className="text-center py-6">
          <p className="text-gray-500 text-sm mb-4">준비됐나요? 지금 바로 시작해보세요!</p>
          <Link
            href="/"
            className="inline-block bg-blue-500 text-white font-semibold px-8 py-3 rounded-xl hover:bg-blue-600 transition-colors"
          >
            예약하러 가기
          </Link>
        </div>

      </div>
    </div>
  )
}

function SectionTitle({ step, title }: { step: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs font-bold text-blue-500 bg-blue-50 px-2 py-1 rounded-lg">{step}</span>
      <h3 className="text-base font-bold text-gray-900">{title}</h3>
    </div>
  )
}

function StepCard({
  num, icon, title, desc, children,
}: {
  num: string; icon: string; title: string; desc: string; children?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border border-gray-100">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm flex-shrink-0">
          {num}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <span>{icon}</span>
            <p className="font-semibold text-gray-900">{title}</p>
          </div>
          <p className="text-sm text-gray-500 leading-relaxed">{desc}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function MockInput({ label, placeholder }: { label: string; placeholder: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <div className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-gray-400">{placeholder}</div>
    </div>
  )
}

function MockTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <div className={`text-xs font-semibold px-3 py-1.5 rounded-lg inline-block ${active ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400'}`}>
      {label}
    </div>
  )
}

function PolicyItem({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-base">{icon}</span>
      <p className="text-sm text-gray-700">{text}</p>
    </div>
  )
}
