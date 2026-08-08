/**
 * KST(Asia/Seoul) 고정 날짜·시각 유틸 (클라이언트/서버 공용)
 *
 * booking-policy.ts 와 같은 규칙을 따른다: 런타임 의존성 없음,
 * 'use server' / 'use client' 지시자 없음, @/lib/supabase* 같은 서버 전용 모듈 import 금지.
 *
 * 왜 별도 모듈인가:
 * booking-policy.ts 는 "같은 입력 → 같은 출력"인 순수 계산기다.
 * 시계를 읽는 함수는 그 불변식을 깨므로 형제 모듈로 분리했다.
 *
 * 왜 Intl.DateTimeFormat 인가:
 * lib/cron/jobs.ts 처럼 `new Date(Date.now() + 9h)` 로 만든 객체는
 * 자신이 가리키는 실제 시각을 속인다 (.getHours() 등이 전부 거짓말이 된다).
 * 곧바로 .toISOString() 으로 날짜만 뽑아 버리기 때문에 그곳에서만 동작하는 방식이라,
 * 여러 곳에서 import 될 이 모듈에는 쓰지 않는다.
 *
 * 날짜 비교는 전부 'YYYY-MM-DD' 문자열 비교로 한다.
 * 이 포맷은 사전순 = 시간순이라 Date 산술 없이 안전하다 (resolvePolicyVersion 과 같은 방식).
 */

/** 예약 시스템의 기준 시간대 */
export const BOOKING_TIME_ZONE = 'Asia/Seoul'

export interface KstNow {
  /** 'YYYY-MM-DD' — KST 기준 오늘 */
  dateStr: string
  /** KST 자정 이후 경과 분 (0..1439). 초는 절삭한다 */
  minutes: number
  /** 'HH:MM' — 안내/에러 문구용 */
  hhmm: string
}

// Intl.DateTimeFormat 은 생성이 비싸고 format 호출은 싸다. 모듈 스코프에 한 번만 만든다.
const KST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: BOOKING_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/**
 * KST 기준 현재 날짜/시각.
 * @param now 테스트용 주입 지점. 생략하면 실제 현재 시각.
 */
export function getKstNow(now: Date = new Date()): KstNow {
  const parts = KST_FORMATTER.formatToParts(now)
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '00'

  const year = pick('year')
  const month = pick('month')
  const day = pick('day')
  // hour12:false 에서도 환경에 따라 자정이 '24' 로 나올 수 있다
  const hour = pick('hour') === '24' ? '00' : pick('hour')
  const minute = pick('minute')

  return {
    dateStr: `${year}-${month}-${day}`,
    minutes: Number(hour) * 60 + Number(minute),
    hhmm: `${hour}:${minute}`,
  }
}

/** KST 기준 오늘 날짜 'YYYY-MM-DD' */
export function getKstTodayString(now?: Date): string {
  return getKstNow(now).dateStr
}

/**
 * (연, 월, 일) → 'YYYY-MM-DD'
 * @param month1 1-based 월 (1 = 1월)
 */
export function toDateString(year: number, month1: number, day: number): string {
  return `${year}-${String(month1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/**
 * 'HH:MM' → 자정 이후 경과 분. 형식이 잘못되면 NaN.
 * 호출부는 Number.isFinite 로 반드시 검사할 것 —
 * NaN 은 모든 비교에서 false 라 검증을 조용히 통과시킨다.
 */
export function timeToMinutes(hhmm: string): number {
  if (typeof hhmm !== 'string') return NaN
  const match = /^(\d{1,2}):(\d{2})/.exec(hhmm)
  if (!match) return NaN

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return NaN

  return hours * 60 + minutes
}

/** 자정 이후 경과 분 → 'HH:MM' */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
