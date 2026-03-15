/**
 * 카카오 알림톡 템플릿 매핑
 * 메시지 타입별 템플릿 ID와 변수 매핑
 */

import type { MessageType, TemplateVariables } from './templates'

/**
 * 메시지 타입별 알림톡 템플릿 ID 매핑
 * 
 * ⚠️ 주의: 템플릿 ID는 SOLAPI 관리자 페이지에서 등록 후 승인된 실제 ID로 교체해야 합니다.
 * 현재는 placeholder 값입니다.
 */
export const ALIMTALK_TEMPLATE_IDS: Record<MessageType, string> = {
  // 회원가입
  '1-2': 'oneum_signup_approved',      // 회원가입 승인
  '1-3': 'oneum_signup_rejected',      // 회원가입 거절
  
  // 예약
  '2-1': 'oneum_booking_member',       // 예약 완료 (회원)
  '2-2': 'oneum_booking_nonmember',    // 예약 완료 (비회원, 입금 안내)
  '2-3': 'oneum_booking_cancelled',    // 예약 취소
  
  // 입금
  '3-1': 'oneum_payment_confirmed',    // 입금 확인
  '3-2': 'oneum_payment_reminder',     // 입금 리마인더
  
  // 리마인더
  '4-1': 'oneum_reminder_d1',          // 전날 리마인더 (비회원)
  '4-2': 'oneum_reminder_1h',          // 1시간 전 리마인더
  '4-3': 'oneum_reminder_d1_member',   // 전날 리마인더 (회원)
  
  // 재무
  '5-2': 'oneum_finance_unpaid',       // 재무 담당자 미입금 알림
  '5-3': 'oneum_finance_refund',       // 재무 담당자 환불 안내
  
  // 관리자
  '6-1': 'oneum_admin_signup',         // 관리자 회원가입 신청 알림
}

/**
 * 템플릿 변수를 알림톡 형식으로 변환
 * 
 * 알림톡 변수 형식: #{변수명}
 * 예: #{이름}, #{날짜}, #{시간}
 */
export function convertToAlimtalkVariables(
  type: MessageType,
  variables: TemplateVariables
): Record<string, string> {
  // 모든 값을 string으로 변환 (SOLAPI 요구사항)
  const alimtalkVars: Record<string, string> = {}
  
  for (const [key, value] of Object.entries(variables)) {
    if (value !== undefined) {
      alimtalkVars[key] = String(value)
    }
  }
  
  return alimtalkVars
}

/**
 * 알림톡 템플릿 내용 (승인 요청용)
 * 
 * 이 내용을 SOLAPI 관리자 페이지에서 템플릿으로 등록해야 합니다.
 */
export const ALIMTALK_TEMPLATE_CONTENTS: Record<MessageType, {
  name: string
  content: string
  variables: string[]
  buttons?: Array<{ name: string; type: string; url?: string }>
}> = {
  '1-2': {
    name: '회원가입 승인',
    content: `#{이름}님, 안녕하세요!

온음 회원 가입이 승인되었습니다.

세대: #{세대}호
로그인 후 바로 예약하실 수 있습니다.

온음과 함께 즐거운 시간 보내세요! 🎵`,
    variables: ['이름', '세대'],
  },

  '1-3': {
    name: '회원가입 거절',
    content: `#{이름}님, 안녕하세요.

온음 회원 가입이 승인되지 않았습니다.

사유: #{사유}

문의사항이 있으시면 관리자에게 연락 부탁드립니다.`,
    variables: ['이름', '사유'],
  },

  '2-1': {
    name: '예약 완료 (회원)',
    content: `#{이름}님(#{세대}호), 예약이 완료되었습니다!

📅 날짜: #{날짜}
⏰ 시간: #{시간}
📍 공간: #{공간}

즐거운 시간 보내세요! 🎵`,
    variables: ['이름', '세대', '날짜', '시간', '공간'],
  },

  '2-2': {
    name: '예약 완료 (비회원, 입금 안내)',
    content: `#{이름}님, 예약이 완료되었습니다!

📅 날짜: #{날짜}
⏰ 시간: #{시간}
📍 공간: #{공간}
💰 금액: #{금액}원

[입금 정보]
계좌: #{계좌}
입금 기한: #{입금기한} 23:59까지

* 기한 내 미입금 시 자동 취소됩니다.

감사합니다! 🎵`,
    variables: ['이름', '날짜', '시간', '공간', '금액', '계좌', '입금기한'],
  },

  '2-3': {
    name: '예약 취소',
    content: `#{이름}님, 예약이 취소되었습니다.

📅 날짜: #{날짜}
⏰ 시간: #{시간}
📍 공간: #{공간}

다음에 또 이용해 주세요!`,
    variables: ['이름', '날짜', '시간', '공간'],
  },

  '3-1': {
    name: '입금 확인',
    content: `#{이름}님, 입금이 확인되었습니다!

📅 날짜: #{날짜}
⏰ 시간: #{시간}
📍 공간: #{공간}

예약이 최종 확정되었습니다.
이용 당일 뵙겠습니다! 🎵`,
    variables: ['이름', '날짜', '시간', '공간'],
  },

  '3-2': {
    name: '입금 리마인더',
    content: `#{이름}님, 입금 확인 요청드립니다.

📅 예약일: #{날짜}
💰 금액: #{금액}원
계좌: #{계좌}

입금 기한: #{입금기한} 23:59까지

* 기한 내 미입금 시 자동 취소됩니다.

감사합니다!`,
    variables: ['이름', '날짜', '금액', '계좌', '입금기한'],
  },

  '4-1': {
    name: '전날 리마인더 (비회원)',
    content: `#{이름}님, 내일 예약 안내드립니다!

📅 날짜: #{날짜}
⏰ 시간: #{시간}
📍 공간: #{공간}

즐거운 시간 보내세요! 🎵`,
    variables: ['이름', '날짜', '시간', '공간'],
  },

  '4-2': {
    name: '1시간 전 리마인더',
    content: `#{이름}님, 1시간 후 예약이 있습니다!

⏰ 시간: #{시간}
📍 공간: #{공간}

#{안내메시지} 🎵`,
    variables: ['이름', '시간', '공간', '안내메시지'],
  },

  '4-3': {
    name: '전날 리마인더 (회원)',
    content: `#{이름}님(#{세대}호), 내일 예약 안내드립니다!

📅 날짜: #{날짜}
⏰ 시간: #{시간}
📍 공간: #{공간}

즐거운 시간 보내세요! 🎵`,
    variables: ['이름', '세대', '날짜', '시간', '공간'],
  },

  '5-2': {
    name: '재무 담당자 미입금 알림',
    content: `재무담당자님,

미입금 예약 #{건수}건이 있습니다.

#{목록}

관리자 페이지:
#{관리자URL}`,
    variables: ['건수', '목록', '관리자URL'],
  },

  '5-3': {
    name: '재무 담당자 환불 안내',
    content: `재무담당자님,

예약 취소로 인한 환불 건이 있습니다.

이름: #{이름}
전화: #{전화}
금액: #{금액}원
예약일: #{날짜}

확인 부탁드립니다.`,
    variables: ['이름', '전화', '금액', '날짜'],
  },

  '6-1': {
    name: '관리자 회원가입 신청 알림',
    content: `관리자님,

새로운 회원가입 신청이 있습니다.

이름: #{이름}
세대: #{세대}호
전화: #{전화}

관리자 페이지:
#{관리자URL}

승인/거부 처리 부탁드립니다.`,
    variables: ['이름', '세대', '전화', '관리자URL'],
  },
}
