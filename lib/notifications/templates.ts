/**
 * 알림톡 메시지 템플릿
 * 총 15개 메시지 타입
 */

export type MessageType =
  | '1-2' | '1-3'           // 회원가입
  | '2-1' | '2-2' | '2-3'   // 예약
  | '3-1' | '3-2'           // 입금
  | '4-1' | '4-2' | '4-3'   // 리마인더
  | '5-2' | '5-3' | '5-4'   // 재무
  | '6-1' | '6-2' | '6-3'   // 관리자
  | '7-1' | '7-2' | '7-3' | '7-4' | '7-5'  // 선불권

export interface TemplateVariables {
  name?: string
  household?: string
  date?: string
  time?: string
  space?: string
  amount?: string
  account?: string
  deadline?: string
  reason?: string
  season?: string
  count?: string
  list?: string
  adminUrl?: string
  phone?: string
  productName?: string
  totalHours?: string
  expiresAt?: string
  [key: string]: string | undefined
}

/**
 * 선불권 미입금 요약 변수 생성 (7-2용)
 */
export function formatPrepaidSummaryVars(purchases: Array<{
  name: string
  household?: string
  productName: string
  amount: number
  deadline: Date
}>): { prepaidCount: string; prepaidList: string; prepaidDeadline: string } {
  const prepaidCount = purchases.length.toString()
  const prepaidList = purchases
    .map(p => `- ${p.name}${p.household ? ` (${p.household}호)` : ''} / ${p.productName} ${p.amount.toLocaleString()}원 (마감: ${p.deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })})`)
    .join('\n')
  const earliest = purchases.reduce((a, b) => a.deadline < b.deadline ? a : b)
  const prepaidDeadline = earliest.deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  return { prepaidCount, prepaidList, prepaidDeadline }
}

/**
 * 메시지 템플릿 가져오기
 */
export function getMessageTemplate(
  type: MessageType,
  variables: TemplateVariables
): { title: string; message: string } {
  const templates: Record<MessageType, (vars: TemplateVariables) => { title: string; message: string }> = {
    // ===== 회원가입 =====
    '1-2': (vars) => ({
      title: '[온음] 가입 승인',
      message: `${vars.name}님, 안녕하세요!

온음 회원 가입이 승인되었습니다.

세대: ${vars.household}호
로그인 후 바로 예약하실 수 있습니다.

온음과 함께 즐거운 시간 보내세요! 🎵`,
    }),

    '1-3': (vars) => ({
      title: '[온음] 가입 거부',
      message: `${vars.name}님, 안녕하세요.

온음 회원 가입이 승인되지 않았습니다.

사유: ${vars.reason || '조건 미충족'}

문의사항이 있으시면 관리자에게 연락 부탁드립니다.`,
    }),

    // ===== 예약 =====
    '2-1': (vars) => ({
      title: '[온음] 예약 완료',
      message: `${vars.name}님(${vars.household}호), 예약이 완료되었습니다!

📅 날짜: ${vars.date}
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}

즐거운 시간 보내세요! 🎵`,
    }),

    '2-2': (vars) => ({
      title: '[온음] 예약 완료 (입금 안내)',
      message: `${vars.name}님, 예약이 완료되었습니다!

📅 날짜: ${vars.date}
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}
💰 금액: ${vars.amount}원

[입금 정보]
계좌: ${vars.account}
입금 기한: ${vars.deadline} 23:59까지

* 기한 내 미입금 시 자동 취소됩니다.

즐거운 시간 보내세요! 🎵`,
    }),

    '2-3': (vars) => ({
      title: '[온음] 예약 취소',
      message: `${vars.name}님, 예약이 취소되었습니다.

📅 날짜: ${vars.date}
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}

다음에 또 이용해 주세요!`,
    }),

    // ===== 입금 =====
    '3-1': (vars) => ({
      title: '[온음] 입금 확인',
      message: `${vars.name}님, 입금이 확인되었습니다!

📅 날짜: ${vars.date}
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}

예약이 최종 확정되었습니다.
이용 당일 뵙겠습니다! 🎵`,
    }),

    '3-2': (vars) => ({
      title: '[온음] 입금 안내',
      message: `${vars.name}님, 입금 확인 요청드립니다.

📅 예약일: ${vars.date}
💰 금액: ${vars.amount}원
계좌: ${vars.account}

입금 기한: ${vars.deadline} 23:59까지

* 기한 내 미입금 시 자동 취소됩니다.

감사합니다!`,
    }),

    // ===== 리마인더 =====
    '4-1': (vars) => ({
      title: '[온음] 내일 예약 안내',
      message: `${vars.name}님, 내일 예약 안내드립니다!

📅 날짜: ${vars.date}
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}

즐거운 시간 보내세요! 🎵`,
    }),

    '4-2': (vars) => {
      const seasonMessage = vars.season === 'summer'
        ? '더운 날씨, 시원하게 보내세요! ☀️'
        : vars.season === 'winter'
        ? '추운 날씨, 따뜻하게 입고 오세요! 🧥'
        : '좋은 날씨, 즐거운 시간 보내세요! 🌸';
      
      return {
        title: '[온음] 오늘 예약 안내',
        message: `${vars.name}님, 오늘 예약이 있습니다!

📅 오늘
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}

${seasonMessage} 🎵`,
      }
    },

    '4-3': (vars) => ({
      title: '[온음] 내일 예약 안내',
      message: `${vars.name}님(${vars.household}호), 내일 예약 안내드립니다!

📅 날짜: ${vars.date}
⏰ 시간: ${vars.time}
📍 공간: ${vars.space}

즐거운 시간 보내세요! 🎵`,
    }),

    // ===== 재무 =====
    '5-2': (vars) => ({
      title: '[온음] 미입금 예약 알림',
      message: `재무담당자님,

미입금 예약 ${vars.count}건이 있습니다.

${vars.list}

관리자 페이지:
${vars.adminUrl}`,
    }),

    '5-4': (vars) => ({
      title: '[온음] 새 예약 신청',
      message: `재무담당자님, 새 예약 신청이 들어왔습니다.

이름: ${vars.name}
전화: ${vars.phone}
날짜: ${vars.date}
시간: ${vars.time}
공간: ${vars.space}
금액: ${vars.amount}원

입금 확인 후 승인 처리 부탁드립니다.
${vars.adminUrl}`,
    }),

    '5-3': (vars) => ({
      title: '[온음] 환불 안내',
      message: `재무담당자님,

예약 취소로 인한 환불 건이 있습니다.

이름: ${vars.name}
전화: ${vars.phone}
금액: ${vars.amount}원
예약일: ${vars.date}

확인 부탁드립니다.`,
    }),

    // ===== 관리자 =====
    '6-2': (vars) => ({
      title: '[온음] 새 문의가 접수되었습니다',
      message: `관리자님,

새 문의가 접수되었습니다.

이름: ${vars.name}
전화: ${vars.phone}
내용: ${vars.content}

관리자 페이지에서 확인하세요:
${vars.adminUrl}`,
    }),

    '6-3': (vars) => ({
      title: '[온음] 문의 답변 안내',
      message: `${vars.name}님, 문의하신 내용에 답변이 등록되었습니다.

아래 링크에서 확인해주세요:
${vars.inquiryUrl}`,
    }),

    '6-1': (vars) => ({
      title: '[온음] 회원가입 신청',
      message: `관리자님,

새로운 회원가입 신청이 있습니다.

이름: ${vars.name}
세대: ${vars.household}호
전화: ${vars.phone}

관리자 페이지:
${vars.adminUrl}

승인/거부 처리 부탁드립니다.`,
    }),

    // ===== 선불권 =====
    '7-1': (vars) => ({
      title: '[온음] 선불권 신청 완료 - 입금 안내',
      message: `${vars.name}님, 선불권 신청이 완료되었습니다!

🎟️ 상품: ${vars.productName}
💰 금액: ${vars.amount}원

[입금 정보]
${vars.account}

입금 기한: ${vars.deadline}까지
* 기한 내 미입금 시 자동 취소됩니다.

입금 후 관리자 확인 시 선불권이 활성화됩니다.
감사합니다! 🎵`,
    }),

    '7-2': (vars) => ({
      title: '[온음] 선불권 신청 알림',
      message: `재무담당자님,

선불권 신청 ${vars.prepaidCount}건이 있습니다.
${vars.prepaidList}
통장의 입금내역을 확인하시고 입금된 내역이 있다면 관리자 페이지에 접속해서 입금확인 처리 해주세요
입금 기한: ${vars.prepaidDeadline}까지

관리자 페이지:
${vars.adminUrl}`,
    }),

    '7-3': (vars) => ({
      title: '[온음] 선불권 활성화 완료',
      message: `${vars.name}님, 선불권이 활성화되었습니다!

🎟️ 상품: ${vars.productName}
⏱️ 총 시간: ${vars.totalHours}시간
📅 만료일: ${vars.expiresAt}

마이페이지에서 잔여 시간을 확인하실 수 있습니다.
온음과 함께 즐거운 시간 보내세요! 🎵`,
    }),

    '7-5': (vars) => ({
      title: '[온음] 선불권 신청',
      message: `재무담당자님, 선불권 신청이 들어왔습니다.

이름: ${vars.name}
상품: ${vars.productName}
금액: ${vars.amount}원
입금 기한: ${vars.deadline}까지

입금 확인 후 활성화 처리 부탁드립니다.
${vars.adminUrl}`,
    }),

    '7-4': (vars) => ({
      title: '[온음] 선불권 비용 입금안내',
      message: `${vars.name}님, 신청하신 선불권 비용을 아직 입금하시지 않은거 같습니다. 💰 금액: ${vars.amount}원 계좌: ${vars.account} 입금 기한: ${vars.deadline} 23:59까지 * 기한 내 미입금 시 자동 취소됩니다. 감사합니다!`,
    }),
  }

  const template = templates[type]
  if (!template) {
    throw new Error(`Unknown message type: ${type}`)
  }

  return template(variables)
}

/**
 * 공간명 변환
 */
export function getSpaceName(space: string): string {
  const spaceNames: Record<string, string> = {
    nolter: '놀터',
    soundroom: '방음실',
  }
  return spaceNames[space] || space
}

/**
 * 전화번호 마스킹 (UI 표시용)
 */
export function maskPhone(phone: string): string {
  const normalized = phone.replace(/[^0-9]/g, '')
  if (normalized.length === 11) {
    return normalized.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')
  }
  return phone
}

/**
 * 예약 목록 포맷팅 (5-2용)
 */
export function formatBookingList(bookings: Array<{
  name: string
  phone: string
  booking_date: string
  amount: number
}>): string {
  return bookings
    .map((b, i) => `${i + 1}. ${b.name} (${maskPhone(b.phone)}) - ${b.booking_date} - ${b.amount.toLocaleString()}원`)
    .join('\n')
}
