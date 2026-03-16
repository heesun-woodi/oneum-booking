/**
 * 알림톡 메시지 템플릿
 * 총 15개 메시지 타입
 */

export type MessageType = 
  | '1-2' | '1-3'           // 회원가입
  | '2-1' | '2-2' | '2-3'   // 예약
  | '3-1' | '3-2'           // 입금
  | '4-1' | '4-2' | '4-3'   // 리마인더
  | '5-2' | '5-3'           // 재무
  | '6-1'                   // 관리자

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
  [key: string]: string | undefined
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

사유: ${vars.reason || '관리자 확인 중'}

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

감사합니다! 🎵`,
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
        ? '더운 날씨, 시원하게 보내세요!' 
        : '따뜻하게 입고 오세요!';
      
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
