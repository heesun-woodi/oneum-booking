# PRD: Phase 4 - 알림톡 + 이용 횟수 관리 시스템

> **프로젝트**: 온음 예약 시스템  
> **버전**: 1.0  
> **작성일**: 2026-03-11  
> **작성자**: Buzz (AI Assistant)

---

## 1. 개요

### 1.1 Phase 4 목표

온음 예약 시스템에 **Aligo 알림톡 API**를 연동하여 예약/입금/리마인더 알림을 자동 발송하고, **회원 이용 횟수 추적 시스템** 및 **입금 관리 시스템**을 구축합니다.

### 1.2 범위

| 영역 | 내용 |
|------|------|
| 알림톡 시스템 | 15개 메시지 템플릿, 즉시/스케줄 발송 |
| 이용 횟수 추적 | 세대별 월별 공간별 카운트 시스템 |
| 입금 관리 | 비회원 결제 상태 관리, 자동 취소 |
| 크론 작업 | 7개 스케줄 작업 구현 |

### 1.3 주요 설정값

```typescript
const CONFIG = {
  ADMIN_PHONE: '01041621557',        // 관리자 (6-1)
  FINANCE_PHONE: '01082289532',      // 재무담당자 (5-2, 5-3)
  BANK_ACCOUNT: '카카오뱅크 7979-72-56275 (정상은)',
  ADMIN_URL: {
    USERS: 'https://oneum.vercel.app/admin/users',
    PAYMENTS: 'https://oneum.vercel.app/admin/payments'
  }
}
```

---

## 2. 기능 요구사항

### 2.1 알림톡 시스템

#### 2.1.1 메시지 분류 (총 15개)

| 카테고리 | ID | 대상 | 발송 시점 | 트리거 |
|----------|-----|------|-----------|--------|
| **회원가입** | 1-2 | 신청자 | 즉시 | 관리자 승인 |
| | 1-3 | 신청자 | 즉시 | 관리자 거부 |
| **예약** | 2-1 | 회원 | 즉시 | 예약 생성 |
| | 2-2 | 비회원 | 즉시 | 예약 생성 |
| | 2-3 | 입금 완료자 | 즉시 | 예약 취소 |
| **입금** | 3-1 | 비회원 | 즉시 | 입금 확인 |
| | 3-2 | 비회원 (미입금) | D-7/5/2 13:00 | 크론 |
| **리마인더** | 4-1 | 비회원 (입금완료) | D-1 09:00 | 크론 |
| | 4-2 | 비회원 | 예약시간 -1h | 크론 (매시간) |
| | 4-3 | 회원 | D-1 09:00 | 크론 |
| **재무** | 5-2 | 재무담당자 | 다중 시점 | 크론 |
| | 5-3 | 재무담당자 | 즉시 | 입금완료 취소 |
| **관리자** | 6-1 | 관리자 | 즉시 | 회원가입 신청 |

#### 2.1.2 즉시 발송 (8개)

```typescript
// 즉시 발송이 필요한 이벤트와 메시지
const INSTANT_TRIGGERS = {
  'user.signup.request': ['6-1'],          // 관리자에게 알림
  'user.signup.approved': ['1-2'],         // 신청자에게 승인 알림
  'user.signup.rejected': ['1-3'],         // 신청자에게 거부 알림
  'booking.created.member': ['2-1'],       // 회원 예약 완료
  'booking.created.nonmember': ['2-2'],    // 비회원 예약 완료
  'booking.cancelled.paid': ['2-3'],       // 입금완료 예약 취소
  'booking.cancelled.refund': ['5-3'],     // 재무담당자 환불 안내
  'payment.confirmed': ['3-1']             // 입금 확인
}
```

#### 2.1.3 스케줄 발송 (7개 크론)

```typescript
// 크론 스케줄 정의
const CRON_SCHEDULES = {
  '0 0 * * *': 'autoCancelUnpaid',        // 00:00 - 미입금 자동 취소
  '0 9 * * *': ['dayBeforeReminder', 'financeFirstAlert_late'],  // 09:00
  '0 13 * * *': 'paymentReminder',        // 13:00 - 입금 미확인 (D-7/5/2)
  '0 16 * * *': 'financeAlert',           // 16:00 - 재무 알림
  '0 21 * * *': 'financeFirstAlert',      // 21:00 - 재무 1차 알림
  '30 23 * * *': 'financeFinalAlert',     // 23:30 - 재무 최종 알림
  '0 * * * *': 'hourlyReminder'           // 매시간 - 1시간 전 알림
}
```

### 2.2 이용 횟수 추적 시스템

#### 2.2.1 규칙

| 상황 | 이용 횟수 변동 |
|------|--------------|
| 예약 생성 | +1 |
| 이용일 전일 23:59 이전 취소 | -1 (복구) |
| 이용 당일 취소 | 유지 (차감) |

#### 2.2.2 조회 범위

- **세대별** (household): 201, 301, 302, 401, 402, 501
- **월별**: YYYY-MM
- **공간별**: 놀터 (nolter), 방음실 (soundroom)

### 2.3 입금 관리 시스템

#### 2.3.1 결제 상태

```typescript
type PaymentStatus = 'pending' | 'completed'

interface PaymentInfo {
  payment_status: PaymentStatus
  payment_confirmed_at: Date | null
  payment_amount: number
}
```

#### 2.3.2 자동 취소 로직

```typescript
// 이용일 전일 자정에 실행
const autoCancelCriteria = {
  member_type: 'non-member',
  payment_status: 'pending',
  booking_date: '내일 날짜'
}
// 조건 충족 시 status = 'cancelled'
```

---

## 3. DB 스키마 변경

### 3.1 bookings 테이블 수정

```sql
-- 결제 관련 컬럼 추가 (기존 status, amount, paid_at 활용 + 신규)
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed')),
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_member_type ON bookings(member_type);
CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, booking_date);
```

### 3.2 notification_logs 테이블 (신규)

```sql
CREATE TABLE notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 발송 대상
  message_type VARCHAR(10) NOT NULL,  -- '1-2', '2-1', etc.
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(100),
  
  -- 연관 데이터
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- 발송 결과
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  aligo_msg_id VARCHAR(50),           -- Aligo 응답 ID
  error_message TEXT,
  
  -- 메타
  scheduled_at TIMESTAMP WITH TIME ZONE,  -- 예약 발송 시간
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_notification_logs_type ON notification_logs(message_type);
CREATE INDEX idx_notification_logs_status ON notification_logs(status);
CREATE INDEX idx_notification_logs_scheduled ON notification_logs(scheduled_at) 
  WHERE status = 'pending';
CREATE INDEX idx_notification_logs_booking ON notification_logs(booking_id);

-- RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can manage notification_logs" ON notification_logs 
  FOR ALL USING (true);
```

### 3.3 usage_tracking 뷰 (쿼리 기반)

```sql
-- 이용 횟수는 bookings 테이블에서 실시간 집계 (별도 테이블 X)
CREATE OR REPLACE VIEW monthly_usage AS
SELECT 
  household,
  space,
  DATE_TRUNC('month', booking_date) AS month,
  COUNT(*) AS usage_count
FROM bookings
WHERE 
  member_type = 'member'
  AND status != 'cancelled'
  AND household IS NOT NULL
GROUP BY household, space, DATE_TRUNC('month', booking_date);

-- 당일 취소 카운트 (차감 대상)
CREATE OR REPLACE VIEW cancelled_same_day AS
SELECT 
  household,
  space,
  DATE_TRUNC('month', booking_date) AS month,
  COUNT(*) AS cancelled_count
FROM bookings
WHERE 
  member_type = 'member'
  AND status = 'cancelled'
  AND household IS NOT NULL
  AND DATE(cancelled_at) = booking_date  -- 당일 취소
GROUP BY household, space, DATE_TRUNC('month', booking_date);
```

### 3.4 cron_job_logs 테이블 (신규)

```sql
CREATE TABLE cron_job_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name VARCHAR(50) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX idx_cron_job_logs_name ON cron_job_logs(job_name);
CREATE INDEX idx_cron_job_logs_started ON cron_job_logs(started_at DESC);
```

---

## 4. API 설계

### 4.1 Aligo API 연동

#### 4.1.1 환경 변수

```bash
# .env.local
ALIGO_API_KEY=your_api_key
ALIGO_USER_ID=your_user_id
ALIGO_SENDER=01012345678  # 발신번호
ALIGO_TESTMODE=N          # 테스트모드 Y/N
```

#### 4.1.2 Aligo 클라이언트

```typescript
// lib/aligo.ts
interface AligoConfig {
  apiKey: string
  userId: string
  sender: string
  testMode: boolean
}

interface SendResult {
  success: boolean
  msgId?: string
  error?: string
}

class AligoClient {
  private config: AligoConfig

  constructor(config: AligoConfig) {
    this.config = config
  }

  async sendSMS(
    phone: string,
    message: string,
    title?: string
  ): Promise<SendResult>

  async sendMMS(
    phone: string,
    message: string,
    title: string,
    image?: string
  ): Promise<SendResult>

  async getRemaining(): Promise<number>
}

export const aligo = new AligoClient({
  apiKey: process.env.ALIGO_API_KEY!,
  userId: process.env.ALIGO_USER_ID!,
  sender: process.env.ALIGO_SENDER!,
  testMode: process.env.ALIGO_TESTMODE === 'Y'
})
```

### 4.2 알림 발송 함수

```typescript
// lib/notifications/sender.ts
type MessageType = 
  | '1-2' | '1-3'           // 회원가입
  | '2-1' | '2-2' | '2-3'   // 예약
  | '3-1' | '3-2'           // 입금
  | '4-1' | '4-2' | '4-3'   // 리마인더
  | '5-2' | '5-3'           // 재무
  | '6-1'                   // 관리자

interface SendNotificationParams {
  type: MessageType
  phone: string
  variables: Record<string, string>
  bookingId?: string
  userId?: string
}

async function sendNotification(params: SendNotificationParams): Promise<{
  success: boolean
  logId: string
  error?: string
}>

// 템플릿 가져오기
function getMessageTemplate(type: MessageType, variables: Record<string, string>): string
```

### 4.3 입금 관리 API

```typescript
// app/actions/payments.ts
'use server'

// 입금 상태 업데이트 + 알림 발송
export async function confirmPayment(bookingId: string): Promise<{
  success: boolean
  error?: string
}>

// 비회원 미입금 예약 목록
export async function getPendingPayments(options?: {
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<{
  success: boolean
  bookings: Booking[]
}>

// 입금 완료 예약 목록
export async function getCompletedPayments(options?: {
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<{
  success: boolean
  bookings: Booking[]
}>
```

### 4.4 이용 횟수 API

```typescript
// app/actions/usage.ts
'use server'

interface UsageCount {
  household: string
  space: 'nolter' | 'soundroom'
  month: string
  count: number
  cancelledSameDay: number
  effectiveCount: number  // count + cancelledSameDay
}

// 세대별 월별 이용 횟수 조회
export async function getMonthlyUsage(
  household: string,
  month?: string  // YYYY-MM, 기본값 현재 월
): Promise<{
  success: boolean
  usage: UsageCount[]
}>

// 전체 세대 이용 현황 (관리자용)
export async function getAllHouseholdUsage(
  month?: string
): Promise<{
  success: boolean
  usages: UsageCount[]
}>
```

### 4.5 크론 API 엔드포인트

```typescript
// app/api/cron/[job]/route.ts
// Vercel Cron 또는 외부 스케줄러에서 호출

export async function GET(
  request: Request,
  { params }: { params: { job: string } }
) {
  // 인증 검증 (CRON_SECRET)
  const authHeader = request.headers.get('authorization')
  if (authHeader !== 'Bearer ' + process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  switch (params.job) {
    case 'auto-cancel':
      return handleAutoCancel()
    case 'day-before-reminder':
      return handleDayBeforeReminder()
    case 'payment-reminder':
      return handlePaymentReminder()
    case 'finance-alert':
      return handleFinanceAlert()
    case 'hourly-reminder':
      return handleHourlyReminder()
    default:
      return Response.json({ error: 'Unknown job' }, { status: 400 })
  }
}
```

---

## 5. UI/UX

### 5.1 회원가입 팝업 (1-1 대체)

```typescript
// 회원가입 신청 완료 시 화면 팝업
const SignupSuccessModal = () => (
  <Modal>
    <h2>가입 신청이 완료되었습니다</h2>
    <p>관리자 승인 후 알림톡을 통해 안내드리겠습니다.</p>
    <p>승인까지 1-2일 정도 소요될 수 있습니다.</p>
    <Button onClick={closeModal}>확인</Button>
  </Modal>
)
```

### 5.2 /admin/payments 페이지

```typescript
// app/admin/payments/page.tsx
interface PaymentsPageProps {}

const PaymentsPage = () => {
  return (
    <AdminLayout>
      <Header>
        <h1>입금 관리</h1>
        <Filters>
          <TabFilter>
            <Tab active>미입금</Tab>
            <Tab>입금완료</Tab>
          </TabFilter>
          <DateRangeFilter />
        </Filters>
      </Header>
      
      <BookingTable>
        {/* 테이블 컬럼: 예약일, 공간, 이름, 전화번호, 금액, 입금상태, 액션 */}
        {bookings.map(booking => (
          <BookingRow key={booking.id}>
            <td>{booking.booking_date}</td>
            <td>{booking.space}</td>
            <td>{booking.name}</td>
            <td>{maskPhone(booking.phone)}</td>
            <td>{booking.amount.toLocaleString()}원</td>
            <td>
              <Checkbox 
                checked={booking.payment_status === 'completed'}
                onChange={() => confirmPayment(booking.id)}
              />
            </td>
            <td>
              <Button onClick={() => openDetail(booking)}>상세</Button>
            </td>
          </BookingRow>
        ))}
      </BookingTable>
    </AdminLayout>
  )
}
```

#### 5.2.1 와이어프레임

```
┌─────────────────────────────────────────────────────────┐
│ 입금 관리                                    [새로고침]  │
├─────────────────────────────────────────────────────────┤
│ [미입금] [입금완료]    기간: [2026-03-01] ~ [2026-03-31]│
├─────────────────────────────────────────────────────────┤
│ 예약일     │ 공간   │ 이름  │ 전화번호     │ 금액    │☑│
├────────────┼────────┼───────┼──────────────┼─────────┼──┤
│ 2026-03-15 │ 놀터   │ 홍길동│ 010-****-1234│ 30,000원│☐│
│ 2026-03-16 │ 방음실 │ 김철수│ 010-****-5678│ 20,000원│☐│
│ 2026-03-17 │ 놀터   │ 이영희│ 010-****-9012│ 30,000원│☑│
└─────────────────────────────────────────────────────────┘
```

### 5.3 이용 횟수 표시 (회원 예약 화면)

```typescript
// 회원 로그인 후 예약 화면에 표시
const UsageDisplay = ({ household }: { household: string }) => {
  const { usage } = useMonthlyUsage(household)
  
  return (
    <div className="usage-info">
      <h4>이번 달 이용 현황</h4>
      <ul>
        <li>놀터: {usage.nolter}회</li>
        <li>방음실: {usage.soundroom}회</li>
      </ul>
    </div>
  )
}
```

---

## 6. 크론 작업 상세

### 6.1 작업 목록

| 시각 | 작업명 | 메시지 | 대상 |
|------|--------|--------|------|
| 00:00 | autoCancelUnpaid | - | 미입금 비회원 예약 |
| 09:00 | dayBeforeReminder | 4-1, 4-3 | 내일 예약자 |
| 09:00 | financeFirstAlert_late | 5-2 | 21시 이후 예약 |
| 13:00 | paymentReminder | 3-2 | D-7/5/2 미입금자 |
| 16:00 | financeAlert | 5-2 | 당일 미입금 예약 |
| 21:00 | financeFirstAlert | 5-2 | 당일 21시 이전 예약 |
| 23:30 | financeFinalAlert | 5-2 | D-1 미입금 예약 |
| 매시간 | hourlyReminder | 4-2 | 1시간 후 예약 비회원 |

### 6.2 각 작업 로직

#### 6.2.1 autoCancelUnpaid (00:00)

```typescript
async function autoCancelUnpaid() {
  const tomorrow = addDays(new Date(), 1)
  
  // 내일 예약 중 미입금 비회원 조회
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_type', 'non-member')
    .eq('payment_status', 'pending')
    .eq('booking_date', format(tomorrow, 'yyyy-MM-dd'))
    .eq('status', 'confirmed')
  
  // 일괄 취소
  for (const booking of bookings) {
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: '입금 미확인 자동 취소'
      })
      .eq('id', booking.id)
    
    // 로그 기록
    await logCronAction('autoCancelUnpaid', booking.id)
  }
  
  return { cancelled: bookings.length }
}
```

#### 6.2.2 dayBeforeReminder (09:00)

```typescript
async function dayBeforeReminder() {
  const tomorrow = addDays(new Date(), 1)
  
  // 내일 예약자 조회
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_date', format(tomorrow, 'yyyy-MM-dd'))
    .eq('status', 'confirmed')
  
  for (const booking of bookings) {
    if (booking.member_type === 'member') {
      // 4-3: 회원용
      await sendNotification({
        type: '4-3',
        phone: booking.phone,
        variables: { name: booking.name, date: booking.booking_date }
      })
    } else if (booking.payment_status === 'completed') {
      // 4-1: 비회원 (입금완료만)
      await sendNotification({
        type: '4-1',
        phone: booking.phone,
        variables: { name: booking.name, date: booking.booking_date }
      })
    }
  }
}
```

#### 6.2.3 hourlyReminder (매시간)

```typescript
async function hourlyReminder() {
  const now = new Date()
  const oneHourLater = addHours(now, 1)
  
  // 1시간 후 시작하는 예약 조회 (비회원만)
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_type', 'non-member')
    .eq('booking_date', format(now, 'yyyy-MM-dd'))
    .eq('status', 'confirmed')
    .gte('start_time', format(oneHourLater, 'HH:mm'))
    .lt('start_time', format(addMinutes(oneHourLater, 1), 'HH:mm'))
  
  // 계절 감지 (4-2 메시지용)
  const month = now.getMonth() + 1
  const season = (month >= 6 && month <= 8) ? 'summer' : 'winter'
  
  for (const booking of bookings) {
    await sendNotification({
      type: '4-2',
      phone: booking.phone,
      variables: { 
        name: booking.name,
        time: booking.start_time,
        season: season
      }
    })
  }
}
```

#### 6.2.4 financeAlert 시리즈 (5-2)

```typescript
// 재무담당자 알림 - 미입금 예약 목록 발송
async function financeAlert(alertType: 'first' | 'follow' | 'final') {
  let targetDate: Date
  
  switch (alertType) {
    case 'first':
      // 오늘 예약 중 미입금
      targetDate = new Date()
      break
    case 'follow':
      // D-7/5/2 미입금
      targetDate = addDays(new Date(), 7) // 또는 5, 2
      break
    case 'final':
      // D-1 미입금
      targetDate = addDays(new Date(), 1)
      break
  }
  
  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_type', 'non-member')
    .eq('payment_status', 'pending')
    .eq('booking_date', format(targetDate, 'yyyy-MM-dd'))
    .eq('status', 'confirmed')
  
  if (bookings.length === 0) return
  
  // 재무담당자에게 발송
  await sendNotification({
    type: '5-2',
    phone: CONFIG.FINANCE_PHONE,
    variables: {
      count: bookings.length.toString(),
      list: formatBookingList(bookings),
      type: alertType
    }
  })
}
```

### 6.3 에러 처리

```typescript
// lib/cron/wrapper.ts
async function withCronLogging<T>(
  jobName: string,
  handler: () => Promise<T>
): Promise<T> {
  // 작업 시작 로그
  const { data: log } = await supabase
    .from('cron_job_logs')
    .insert({ job_name: jobName })
    .select()
    .single()
  
  try {
    const result = await handler()
    
    // 성공 로그
    await supabase
      .from('cron_job_logs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        metadata: result
      })
      .eq('id', log.id)
    
    return result
  } catch (error) {
    // 실패 로그
    await supabase
      .from('cron_job_logs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error.message
      })
      .eq('id', log.id)
    
    // 관리자에게 알림 (선택적)
    await notifyAdminOnError(jobName, error)
    
    throw error
  }
}
```

---

## 7. 발송 로직 플로우

### 7.1 회원 vs 비회원 발송 분기

```typescript
// 예약 생성 시
async function onBookingCreated(booking: Booking) {
  if (booking.member_type === 'member') {
    // 2-1: 회원 예약 완료
    await sendNotification({
      type: '2-1',
      phone: booking.phone,
      variables: {
        name: booking.name,
        household: booking.household!,
        date: booking.booking_date,
        time: booking.start_time + ' ~ ' + booking.end_time,
        space: getSpaceName(booking.space)
      },
      bookingId: booking.id
    })
  } else {
    // 2-2: 비회원 예약 완료
    await sendNotification({
      type: '2-2',
      phone: booking.phone,
      variables: {
        name: booking.name,
        date: booking.booking_date,
        time: booking.start_time + ' ~ ' + booking.end_time,
        space: getSpaceName(booking.space),
        amount: booking.amount.toLocaleString(),
        account: CONFIG.BANK_ACCOUNT,
        deadline: format(subDays(parseISO(booking.booking_date), 1), 'M월 d일')
      },
      bookingId: booking.id
    })
  }
}
```

### 7.2 예약 취소 시

```typescript
async function onBookingCancelled(booking: Booking) {
  // 입금 완료자에게만 취소 알림
  if (booking.payment_status === 'completed') {
    // 2-3: 예약 취소 알림
    await sendNotification({
      type: '2-3',
      phone: booking.phone,
      variables: { name: booking.name, date: booking.booking_date }
    })
    
    // 5-3: 재무담당자 환불 안내 (이용일 아닌 경우만)
    if (booking.booking_date !== format(new Date(), 'yyyy-MM-dd')) {
      await sendNotification({
        type: '5-3',
        phone: CONFIG.FINANCE_PHONE,
        variables: {
          name: booking.name,
          phone: booking.phone,
          amount: booking.amount.toLocaleString()
        }
      })
    }
  }
  
  // 이용 횟수 처리
  if (booking.member_type === 'member') {
    // 취소일이 이용일 전일까지면 카운트 복구 (뷰에서 자동 처리)
    // cancelled_at 저장으로 뷰에서 필터링
  }
}
```

---

## 8. 예상 작업 시간

### 8.1 세부 태스크

| Phase | 태스크 | 예상 시간 |
|-------|--------|----------|
| **4.1** | **Aligo API 연동** | **4h** |
| | 환경 변수 설정 | 0.5h |
| | Aligo 클라이언트 구현 | 2h |
| | 테스트 발송 검증 | 1h |
| | 에러 핸들링 | 0.5h |
| **4.2** | **알림 발송 시스템** | **8h** |
| | 메시지 템플릿 15개 작성 | 2h |
| | 발송 함수 구현 | 3h |
| | notification_logs 테이블 | 1h |
| | 로깅 시스템 | 2h |
| **4.3** | **이용 횟수 추적** | **3h** |
| | DB 뷰 생성 | 1h |
| | API 구현 | 1.5h |
| | UI 표시 컴포넌트 | 0.5h |
| **4.4** | **입금 관리** | **5h** |
| | DB 컬럼 추가 | 0.5h |
| | /admin/payments 페이지 | 3h |
| | 입금 확인 API | 1h |
| | 알림 연동 | 0.5h |
| **4.5** | **크론 작업** | **6h** |
| | API 엔드포인트 7개 | 3h |
| | 각 작업 로직 구현 | 2h |
| | Vercel Cron 설정 | 0.5h |
| | 에러 핸들링/로깅 | 0.5h |
| **4.6** | **즉시 발송 통합** | **4h** |
| | 회원가입 훅 연동 | 1h |
| | 예약 생성/취소 훅 | 2h |
| | 입금 확인 훅 | 1h |
| **4.7** | **테스트 & 검증** | **4h** |
| | 단위 테스트 | 2h |
| | E2E 테스트 | 2h |

### 8.2 총 소요 시간

| 구분 | 시간 |
|------|------|
| 개발 | 30h |
| 테스트 | 4h |
| **합계** | **34h** |

### 8.3 권장 스프린트 계획

| 스프린트 | 기간 | 내용 |
|----------|------|------|
| Sprint 1 | 1-2일 | Aligo 연동 + 메시지 템플릿 |
| Sprint 2 | 2-3일 | 즉시 발송 통합 + 로깅 |
| Sprint 3 | 2일 | 크론 작업 구현 |
| Sprint 4 | 1-2일 | 입금 관리 + 이용 횟수 |
| Sprint 5 | 1일 | 테스트 + 버그 수정 |

---

## 9. 테스트 계획

### 9.1 단위 테스트

```typescript
// __tests__/lib/aligo.test.ts
describe('AligoClient', () => {
  it('should send SMS successfully', async () => {
    const result = await aligo.sendSMS('01012345678', '테스트 메시지')
    expect(result.success).toBe(true)
    expect(result.msgId).toBeDefined()
  })

  it('should handle invalid phone number', async () => {
    const result = await aligo.sendSMS('invalid', '테스트')
    expect(result.success).toBe(false)
    expect(result.error).toContain('전화번호')
  })
})

// __tests__/lib/notifications.test.ts
describe('sendNotification', () => {
  it('should send 2-1 message correctly', async () => {
    const result = await sendNotification({
      type: '2-1',
      phone: '01012345678',
      variables: { name: '홍길동', date: '3월 15일' }
    })
    expect(result.success).toBe(true)
  })

  it('should log notification to database', async () => {
    await sendNotification({ type: '2-1', phone: '01012345678', variables: {} })
    const log = await getLatestNotificationLog()
    expect(log.status).toBe('sent')
  })
})

// __tests__/lib/usage.test.ts
describe('Usage Tracking', () => {
  it('should count booking correctly', async () => {
    await createBooking({ household: '201' })
    const usage = await getMonthlyUsage('201')
    expect(usage.nolter).toBeGreaterThan(0)
  })

  it('should restore count on early cancellation', async () => {
    const booking = await createBooking({})
    const before = await getMonthlyUsage('201')
    await cancelBooking(booking.id) // 이용일 전날까지
    const after = await getMonthlyUsage('201')
    expect(after.nolter).toBe(before.nolter - 1)
  })
})
```

### 9.2 E2E 테스트 시나리오

```typescript
// e2e/alimtalk.spec.ts
import { test, expect } from '@playwright/test'

test.describe('알림톡 시스템', () => {
  test('비회원 예약 플로우 - 알림 발송', async ({ page }) => {
    // 1. 비회원 예약 생성
    await page.goto('/')
    await page.click('[data-testid="date-15"]')
    await page.fill('[name="name"]', '테스트')
    await page.fill('[name="phone"]', '01099998888')
    await page.click('[data-testid="submit-booking"]')
    
    // 2. 예약 완료 확인
    await expect(page.locator('.success-message')).toBeVisible()
    
    // 3. 알림 로그 확인 (관리자 API)
    const logs = await api.getNotificationLogs({ phone: '01099998888' })
    expect(logs).toContainEqual(
      expect.objectContaining({ message_type: '2-2', status: 'sent' })
    )
  })

  test('관리자 입금 확인 - 알림 발송', async ({ page }) => {
    // 1. 관리자 로그인
    await adminLogin(page)
    
    // 2. 입금 관리 페이지
    await page.goto('/admin/payments')
    
    // 3. 입금 체크박스 클릭
    await page.click('[data-testid="confirm-payment-1"]')
    
    // 4. 알림 발송 확인
    await expect(page.locator('.toast-success')).toContainText('입금 확인 완료')
  })
})
```

### 9.3 크론 작업 테스트

```typescript
// e2e/cron.spec.ts
test.describe('크론 작업', () => {
  test('자동 취소 (00:00)', async () => {
    // 1. 내일 날짜 미입금 예약 생성
    const booking = await createTestBooking({
      booking_date: tomorrow,
      payment_status: 'pending',
      member_type: 'non-member'
    })
    
    // 2. 크론 실행
    await fetch('/api/cron/auto-cancel', {
      headers: { Authorization: 'Bearer ' + CRON_SECRET }
    })
    
    // 3. 취소 확인
    const updated = await getBooking(booking.id)
    expect(updated.status).toBe('cancelled')
  })
})
```

---

## 10. 보안 & 개인정보

### 10.1 API Key 관리

```typescript
// 환경 변수 검증
const requiredEnvVars = [
  'ALIGO_API_KEY',
  'ALIGO_USER_ID',
  'ALIGO_SENDER',
  'CRON_SECRET'
]

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error('Missing required environment variable: ' + envVar)
  }
}
```

**Vercel 설정**:
- 모든 API Key는 Vercel Environment Variables에 저장
- Production/Preview/Development 환경 분리
- CRON_SECRET은 랜덤 생성 (32자 이상)

### 10.2 전화번호 처리

```typescript
// 전화번호 마스킹 (UI 표시용)
function maskPhone(phone: string): string {
  return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')
}

// 전화번호 정규화 (발송용)
function normalizePhone(phone: string): string {
  return phone.replace(/[^0-9]/g, '')
}
```

### 10.3 접근 제어

```typescript
// 크론 엔드포인트 인증
function verifyCronAuth(request: Request): boolean {
  const auth = request.headers.get('authorization')
  return auth === 'Bearer ' + process.env.CRON_SECRET
}

// 관리자 전용 API
async function requireAdmin(request: Request): Promise<AdminSession> {
  const session = await getAdminSession(request)
  if (!session) {
    throw new Error('Unauthorized')
  }
  return session
}
```

### 10.4 로깅 보안

```typescript
// 민감 정보 제외 로깅
function sanitizeForLog(data: any): any {
  const sanitized = { ...data }
  if (sanitized.phone) {
    sanitized.phone = maskPhone(sanitized.phone)
  }
  return sanitized
}
```

### 10.5 데이터 보존 정책

| 데이터 | 보존 기간 | 비고 |
|--------|----------|------|
| notification_logs | 1년 | 발송 이력 감사 |
| cron_job_logs | 3개월 | 운영 모니터링 |
| bookings | 영구 | 서비스 기록 |

---

## 11. 메시지 템플릿 (참고)

> 실제 메시지 문구는 우디와 협의 완료. 여기서는 변수 구조만 정의.

### 11.1 템플릿 변수

```typescript
const TEMPLATE_VARIABLES = {
  '1-2': ['name', 'household'],
  '1-3': ['name', 'reason'],
  '2-1': ['name', 'household', 'date', 'time', 'space'],
  '2-2': ['name', 'date', 'time', 'space', 'amount', 'account', 'deadline'],
  '2-3': ['name', 'date', 'time', 'space'],
  '3-1': ['name', 'date', 'time', 'space'],
  '3-2': ['name', 'date', 'amount', 'account', 'deadline'],
  '4-1': ['name', 'date', 'time', 'space'],
  '4-2': ['name', 'time', 'space', 'seasonMessage'],
  '4-3': ['name', 'household', 'date', 'time', 'space'],
  '5-2': ['count', 'bookingList', 'adminUrl'],
  '5-3': ['name', 'phone', 'amount', 'date'],
  '6-1': ['name', 'household', 'phone', 'adminUrl']
}
```

---

## 12. 향후 고려사항

### 12.1 확장 가능성

- **카카오 알림톡 연동**: Aligo → 카카오 비즈메시지 전환
- **이메일 알림 추가**: 알림톡 실패 시 백업
- **푸시 알림**: 앱 개발 시 연동

### 12.2 운영 개선

- **발송 통계 대시보드**: 일별/주별 발송량, 실패율
- **A/B 테스트**: 메시지 문구 최적화
- **발송 시간 최적화**: 사용자 응답률 분석

---

## 변경 이력

| 버전 | 날짜 | 변경 내용 | 작성자 |
|------|------|----------|--------|
| 1.0 | 2026-03-11 | 최초 작성 | Buzz |

---

_문서 끝_
