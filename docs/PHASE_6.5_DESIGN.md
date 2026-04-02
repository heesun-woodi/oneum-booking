# Phase 6.5: 예약 플로우 연동 상세 설계

**문서 버전**: 1.0  
**작성일**: 2026-04-02  
**작성자**: 버즈 (Subagent)  
**상태**: Ready for Implementation

---

## 📋 목차

1. [개요](#1-개요)
2. [현재 시스템 분석](#2-현재-시스템-분석)
3. [DB 변경사항](#3-db-변경사항)
4. [선불권 차감 로직](#4-선불권-차감-로직)
5. [API 스펙](#5-api-스펙)
6. [트랜잭션 처리](#6-트랜잭션-처리)
7. [UI 변경사항](#7-ui-변경사항)
8. [엣지 케이스 처리](#8-엣지-케이스-처리)
9. [테스트 시나리오](#9-테스트-시나리오)
10. [구현 가이드](#10-구현-가이드)

---

## 1. 개요

### 1.1 목표

예약 생성 시 사용자의 선불권을 **자동으로 확인하고 차감**하며, 
선불권이 부족할 경우 **혼합 예약**(선불권 + 일반 결제)을 처리한다.

### 1.2 핵심 기능

| 기능 | 설명 |
|------|------|
| **자동 차감** | 예약 시 보유 선불권 자동 확인 → 먼저 사용 |
| **혼합 예약** | 선불권 2시간 + 일반 1시간 = 3시간 예약 |
| **우선순위** | 만료일 가까운 선불권 먼저 사용 (FIFO by expires_at) |
| **원자성** | 예약 + 차감 + 내역 기록 = 하나의 트랜잭션 |

---

## 2. 현재 시스템 분석

### 2.1 예약 테이블 (`bookings`)

```sql
-- 현재 구조 (001_create_bookings.sql)
CREATE TABLE bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  space VARCHAR(20) NOT NULL,  -- 'nolter' | 'soundroom'
  member_type VARCHAR(20) NOT NULL,  -- 'member' | 'non-member'
  household VARCHAR(10),
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending',  -- pending | confirmed | cancelled
  amount INTEGER DEFAULT 0,
  
  -- Phase 6.2에서 추가됨
  prepaid_hours_used INTEGER DEFAULT 0,
  regular_hours INTEGER DEFAULT 0,
  
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 2.2 선불권 테이블 (`prepaid_purchases`)

```sql
-- 현재 구조 (013_add_prepaid_tables.sql)
CREATE TABLE prepaid_purchases (
  id UUID,
  user_id UUID NOT NULL REFERENCES users(id),
  product_id UUID NOT NULL REFERENCES prepaid_products(id),
  total_hours INTEGER NOT NULL,      -- 구매한 총 시간 (10)
  remaining_hours INTEGER NOT NULL,  -- 남은 시간
  purchased_at TIMESTAMP,
  paid_at TIMESTAMP,                 -- 입금 확인 시점
  expires_at TIMESTAMP,              -- 유효 종료일
  status VARCHAR(20) DEFAULT 'pending',  -- pending | paid | refunded
  ...
);
```

### 2.3 현재 예약 로직 (`app/actions/bookings.ts`)

```typescript
// 현재 로직: 회원/비회원 구분만 있음
const amount = input.memberType === 'member' ? 0 : input.times.length * 14000;

// 회원: confirmed + completed
// 비회원: pending + pending (입금 대기)
```

**🔴 문제점**: 선불권 처리 로직이 없음!

---

## 3. DB 변경사항

### 3.1 bookings 테이블 추가 컬럼

이미 Phase 6.2에서 추가됨:
- `prepaid_hours_used INTEGER DEFAULT 0` ✅
- `regular_hours INTEGER DEFAULT 0` ✅

### 3.2 추가 컬럼 필요 (새로 추가)

```sql
-- 선불권 사용 예약 vs 일반 예약 구분을 위한 payment_method 추가
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'regular'
  CHECK (payment_method IN ('free', 'regular', 'prepaid', 'mixed'));

-- free: 세대 회원 무료 사용
-- regular: 일반 유료 결제 (14,000원/시간)
-- prepaid: 선불권만 사용
-- mixed: 선불권 + 일반 결제 혼합

-- user_id 연결 (선불권 사용자 추적)
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);
```

### 3.3 Migration SQL

```sql
-- 014_booking_prepaid_integration.sql

-- 1. payment_method 컬럼 추가
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'regular';

-- 기존 데이터 마이그레이션
UPDATE bookings 
SET payment_method = CASE 
  WHEN member_type = 'member' AND amount = 0 THEN 'free'
  WHEN member_type = 'non-member' THEN 'regular'
  ELSE 'regular'
END;

-- CHECK 제약 추가
ALTER TABLE bookings 
  ADD CONSTRAINT bookings_payment_method_check 
  CHECK (payment_method IN ('free', 'regular', 'prepaid', 'mixed'));

-- 2. user_id 컬럼 추가
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- 3. payment_status 컬럼 추가 (없으면)
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending'
  CHECK (payment_status IN ('pending', 'completed', 'refunded'));

-- 4. 인덱스
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method ON bookings(payment_method);
```

---

## 4. 선불권 차감 로직

### 4.1 플로우차트 (텍스트)

```
예약 요청 수신 (user_id, hours, space, date)
         │
         ▼
┌────────────────────┐
│ 1. 입력값 검증      │
│ - 당일 예약 차단    │
│ - 과거 날짜 차단    │
└────────┬───────────┘
         │
         ▼
┌────────────────────┐
│ 2. 세대 회원 체크   │◀── user.is_resident == true?
└────────┬───────────┘
         │
    ┌────┴────┐
    ▼ Yes     ▼ No
┌─────────┐  ┌──────────────────┐
│무료체크 │  │ 3. 선불권 조회    │
│월8시간내│  │ getUserPrepaid() │
└────┬────┘  └────────┬─────────┘
     │                │
     ▼                ▼
[무료예약]    ┌──────────────────────────┐
             │ remaining >= 예약시간?   │
             └────────┬─────────────────┘
                      │
         ┌────────────┼────────────┐
         ▼ 예         ▼ 일부        ▼ 아니오
┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ 선불권 전체  │  │ 혼합 예약   │  │ 일반 예약   │
│ deductAll() │  │ deductMixed │  │ createPaid │
└─────────────┘  └─────────────┘  └─────────────┘
         │              │              │
         ▼              ▼              ▼
    [확정/완료]   [부분확정/입금대기] [입금대기]
```

### 4.2 핵심 알고리즘 (Pseudo Code)

```typescript
async function createBookingWithPrepaid(input: BookingInput): Promise<BookingResult> {
  const { userId, hours, space, date, ... } = input;
  
  // ========================================
  // STEP 1: 유효한 선불권 조회 (만료일 오름차순)
  // ========================================
  const activePrepaid = await getPaidPrepaidPurchases(userId, {
    orderBy: 'expires_at ASC',
    where: {
      status: 'paid',
      remaining_hours: { gt: 0 },
      expires_at: { gt: date }  // 예약일 기준 유효
    }
  });
  
  // ========================================
  // STEP 2: 사용 가능한 총 시간 계산
  // ========================================
  const totalAvailableHours = activePrepaid.reduce(
    (sum, p) => sum + p.remaining_hours, 0
  );
  
  // ========================================
  // STEP 3: 차감 계획 수립
  // ========================================
  let prepaidHoursToUse = 0;
  let regularHours = 0;
  let deductionPlan: DeductionPlan[] = [];
  
  if (totalAvailableHours >= hours) {
    // 선불권만으로 충분
    prepaidHoursToUse = hours;
    regularHours = 0;
    paymentMethod = 'prepaid';
  } else if (totalAvailableHours > 0) {
    // 혼합 예약
    prepaidHoursToUse = totalAvailableHours;
    regularHours = hours - totalAvailableHours;
    paymentMethod = 'mixed';
  } else {
    // 선불권 없음
    prepaidHoursToUse = 0;
    regularHours = hours;
    paymentMethod = 'regular';
  }
  
  // 차감 계획: 만료일 가까운 순서로
  let remaining = prepaidHoursToUse;
  for (const purchase of activePrepaid) {
    if (remaining <= 0) break;
    
    const toDeduct = Math.min(remaining, purchase.remaining_hours);
    deductionPlan.push({
      purchaseId: purchase.id,
      hoursToDeduct: toDeduct
    });
    remaining -= toDeduct;
  }
  
  // ========================================
  // STEP 4: 트랜잭션 실행
  // ========================================
  return await executeBookingTransaction({
    bookingData: { ...input, prepaidHoursToUse, regularHours, paymentMethod },
    deductionPlan,
    amount: regularHours * 14000
  });
}
```

### 4.3 차감 우선순위

```sql
-- 쿼리: 사용 가능한 선불권 (우선순위 적용)
SELECT * FROM prepaid_purchases
WHERE user_id = $1
  AND status = 'paid'
  AND remaining_hours > 0
  AND expires_at > $2  -- 예약 시작 시간보다 이후
ORDER BY 
  expires_at ASC,       -- 1순위: 만료일 가까운 것
  remaining_hours ASC;  -- 2순위: 잔여 적은 것
```

---

## 5. API 스펙

### 5.1 예약 생성 API 수정

**파일**: `app/actions/bookings.ts`

#### 기존 인터페이스 확장

```typescript
export interface CreateBookingInput {
  // 기존 필드
  bookingDate: string;
  times: string[];
  space: 'nolter' | 'soundroom';
  memberType: 'member' | 'non-member';
  household?: string;
  name: string;
  phone: string;
  
  // 🆕 새로운 필드
  userId?: string;  // 로그인한 사용자 (선불권 조회용)
}

export interface BookingResult {
  success: boolean;
  data?: Booking;
  error?: string;
  
  // 🆕 선불권 정보
  prepaidInfo?: {
    prepaidHoursUsed: number;
    regularHours: number;
    remainingPrepaidHours: number;
    paymentMethod: 'free' | 'regular' | 'prepaid' | 'mixed';
    amountToPay: number;
  };
}
```

### 5.2 새로운 유틸 함수

**파일**: `lib/prepaid/booking-utils.ts`

```typescript
/**
 * 사용자의 유효한 선불권 조회
 */
export async function getAvailablePrepaidPurchases(
  userId: string,
  bookingDate: Date
): Promise<PrepaidPurchase[]>;

/**
 * 선불권 차감 계획 수립
 */
export interface DeductionPlan {
  purchaseId: string;
  hoursToDeduct: number;
}

export function createDeductionPlan(
  prepaidPurchases: PrepaidPurchase[],
  hoursNeeded: number
): { plan: DeductionPlan[]; prepaidHours: number; regularHours: number };

/**
 * 예약 비용 계산
 */
export interface BookingCost {
  prepaidHours: number;
  regularHours: number;
  totalHours: number;
  amount: number;  // 결제 필요 금액
  paymentMethod: 'free' | 'regular' | 'prepaid' | 'mixed';
}

export async function calculateBookingCost(
  userId: string | undefined,
  hours: number,
  bookingDate: Date,
  isMember: boolean
): Promise<BookingCost>;

/**
 * 선불권 차감 실행 (트랜잭션 내에서 호출)
 */
export async function deductPrepaidHours(
  supabase: SupabaseClient,
  deductionPlan: DeductionPlan[],
  bookingId: string
): Promise<void>;
```

### 5.3 선불권 조회 API

**엔드포인트**: `GET /api/prepaid/my-purchases`

```typescript
// Response
{
  success: true,
  purchases: [
    {
      id: "uuid",
      total_hours: 10,
      remaining_hours: 7,
      expires_at: "2026-10-02T00:00:00Z",
      status: "paid"
    }
  ],
  summary: {
    totalRemainingHours: 7,
    earliestExpiry: "2026-10-02T00:00:00Z"
  }
}
```

### 5.4 예약 비용 미리보기 API (새로 추가)

**엔드포인트**: `POST /api/bookings/preview`

```typescript
// Request
{
  userId: "uuid",
  hours: 3,
  bookingDate: "2026-04-10"
}

// Response
{
  success: true,
  cost: {
    prepaidHours: 2,
    regularHours: 1,
    totalHours: 3,
    amount: 14000,
    paymentMethod: "mixed"
  },
  prepaidDetail: [
    { purchaseId: "uuid", hoursToUse: 2, expiresAt: "2026-06-15" }
  ]
}
```

---

## 6. 트랜잭션 처리

### 6.1 원자성 요구사항

하나의 예약 생성에서 다음이 **모두 성공하거나 모두 실패**해야 함:

1. `bookings` 테이블에 예약 생성
2. `prepaid_purchases.remaining_hours` 차감 (여러 건 가능)
3. `prepaid_usages` 테이블에 사용 내역 기록 (여러 건 가능)

### 6.2 Supabase 트랜잭션 구현

```typescript
// lib/prepaid/execute-booking-transaction.ts

import { createServiceRoleClient } from '@/lib/supabase/server';

interface TransactionInput {
  bookingData: {
    bookingDate: string;
    startTime: string;
    endTime: string;
    space: string;
    memberType: string;
    household?: string;
    name: string;
    phone: string;
    userId?: string;
    prepaidHoursUsed: number;
    regularHours: number;
    paymentMethod: string;
    amount: number;
  };
  deductionPlan: DeductionPlan[];
}

export async function executeBookingTransaction(
  input: TransactionInput
): Promise<BookingResult> {
  const supabase = await createServiceRoleClient();
  
  // Supabase는 기본 트랜잭션이 없으므로 RPC 함수 사용
  const { data, error } = await supabase.rpc('create_booking_with_prepaid', {
    p_booking_data: JSON.stringify(input.bookingData),
    p_deduction_plan: JSON.stringify(input.deductionPlan)
  });
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true, data };
}
```

### 6.3 PostgreSQL 함수 (트랜잭션 보장)

```sql
-- 015_booking_prepaid_transaction.sql

CREATE OR REPLACE FUNCTION create_booking_with_prepaid(
  p_booking_data JSONB,
  p_deduction_plan JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_booking_id UUID;
  v_plan JSONB;
  v_purchase_id UUID;
  v_hours_to_deduct INTEGER;
  v_current_remaining INTEGER;
BEGIN
  -- 1. 예약 생성
  INSERT INTO bookings (
    booking_date, start_time, end_time, space,
    member_type, household, name, phone, user_id,
    prepaid_hours_used, regular_hours, payment_method,
    amount, status, payment_status
  )
  VALUES (
    (p_booking_data->>'bookingDate')::DATE,
    (p_booking_data->>'startTime')::TIME,
    (p_booking_data->>'endTime')::TIME,
    p_booking_data->>'space',
    p_booking_data->>'memberType',
    p_booking_data->>'household',
    p_booking_data->>'name',
    p_booking_data->>'phone',
    (p_booking_data->>'userId')::UUID,
    COALESCE((p_booking_data->>'prepaidHoursUsed')::INTEGER, 0),
    COALESCE((p_booking_data->>'regularHours')::INTEGER, 0),
    COALESCE(p_booking_data->>'paymentMethod', 'regular'),
    COALESCE((p_booking_data->>'amount')::INTEGER, 0),
    CASE 
      WHEN p_booking_data->>'paymentMethod' IN ('free', 'prepaid') THEN 'confirmed'
      ELSE 'pending'
    END,
    CASE 
      WHEN p_booking_data->>'paymentMethod' IN ('free', 'prepaid') THEN 'completed'
      ELSE 'pending'
    END
  )
  RETURNING id INTO v_booking_id;
  
  -- 2. 선불권 차감 (deductionPlan 순회)
  FOR v_plan IN SELECT * FROM jsonb_array_elements(p_deduction_plan)
  LOOP
    v_purchase_id := (v_plan->>'purchaseId')::UUID;
    v_hours_to_deduct := (v_plan->>'hoursToDeduct')::INTEGER;
    
    -- 현재 잔여 시간 확인 (낙관적 잠금)
    SELECT remaining_hours INTO v_current_remaining
    FROM prepaid_purchases
    WHERE id = v_purchase_id
    FOR UPDATE;  -- 행 잠금
    
    -- 부족하면 롤백
    IF v_current_remaining < v_hours_to_deduct THEN
      RAISE EXCEPTION 'Insufficient prepaid hours for purchase %', v_purchase_id;
    END IF;
    
    -- 차감
    UPDATE prepaid_purchases
    SET remaining_hours = remaining_hours - v_hours_to_deduct,
        updated_at = NOW()
    WHERE id = v_purchase_id;
    
    -- 사용 내역 기록
    INSERT INTO prepaid_usages (purchase_id, booking_id, hours_used)
    VALUES (v_purchase_id, v_booking_id, v_hours_to_deduct);
  END LOOP;
  
  -- 3. 결과 반환
  RETURN jsonb_build_object(
    'success', true,
    'bookingId', v_booking_id
  );
  
EXCEPTION WHEN OTHERS THEN
  -- 모든 변경 롤백됨 (PostgreSQL 기본 동작)
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;
```

---

## 7. UI 변경사항

### 7.1 예약 모달 변경

**파일**: `app/components/BookingModal.tsx` (또는 해당 컴포넌트)

#### 선불권 보유 시 상단 표시

```tsx
// 선불권 정보 섹션
{userId && prepaidInfo && prepaidInfo.totalRemainingHours > 0 && (
  <div className="bg-purple-50 rounded-lg p-3 mb-4">
    <div className="flex items-center gap-2 text-purple-700">
      <span className="text-lg">🎫</span>
      <span className="font-medium">
        보유 선불권: {prepaidInfo.totalRemainingHours}시간 남음
      </span>
    </div>
    {prepaidInfo.earliestExpiry && (
      <div className="text-sm text-purple-500 mt-1">
        가장 가까운 만료: {formatDate(prepaidInfo.earliestExpiry)}
      </div>
    )}
  </div>
)}
```

#### 결제 정보 섹션 (시간 선택 후)

```tsx
// 결제 정보 미리보기
{selectedTimes.length > 0 && bookingCost && (
  <div className="border-t pt-4 mt-4">
    <h4 className="font-medium text-gray-900 mb-2">💳 결제 정보</h4>
    
    {bookingCost.paymentMethod === 'prepaid' && (
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>선불권 사용</span>
          <span className="text-purple-600 font-medium">
            {bookingCost.prepaidHours}시간
          </span>
        </div>
        <div className="flex justify-between text-gray-500">
          <span>남은 선불권</span>
          <span>{prepaidInfo.totalRemainingHours - bookingCost.prepaidHours}시간</span>
        </div>
        <div className="border-t pt-2 mt-2 flex justify-between font-medium">
          <span>결제 금액</span>
          <span className="text-green-600">0원 (선불권 결제)</span>
        </div>
      </div>
    )}
    
    {bookingCost.paymentMethod === 'mixed' && (
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>선불권 사용</span>
          <span className="text-purple-600">{bookingCost.prepaidHours}시간</span>
        </div>
        <div className="flex justify-between">
          <span>일반 예약</span>
          <span>{bookingCost.regularHours}시간</span>
        </div>
        <div className="border-t pt-2 mt-2 flex justify-between font-medium">
          <span>결제 금액</span>
          <span className="text-blue-600">
            {bookingCost.amount.toLocaleString()}원
          </span>
        </div>
        <div className="text-xs text-amber-600 mt-2">
          ⚠️ 선불권 {bookingCost.prepaidHours}시간 소진 후 
          나머지 {bookingCost.regularHours}시간은 입금 후 확정됩니다.
        </div>
      </div>
    )}
    
    {bookingCost.paymentMethod === 'regular' && (
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span>예약 시간</span>
          <span>{bookingCost.totalHours}시간</span>
        </div>
        <div className="flex justify-between">
          <span>시간당 금액</span>
          <span>14,000원</span>
        </div>
        <div className="border-t pt-2 mt-2 flex justify-between font-medium">
          <span>결제 금액</span>
          <span className="text-blue-600">
            {bookingCost.amount.toLocaleString()}원
          </span>
        </div>
      </div>
    )}
  </div>
)}
```

### 7.2 예약 완료 화면

```tsx
// 예약 완료 후 표시
{booking.paymentMethod === 'prepaid' && (
  <div className="text-center py-4">
    <div className="text-5xl mb-3">🎫✅</div>
    <h3 className="text-xl font-bold text-green-600">예약 완료!</h3>
    <p className="text-gray-600 mt-2">
      선불권 {booking.prepaidHoursUsed}시간이 사용되었습니다.
    </p>
  </div>
)}

{booking.paymentMethod === 'mixed' && (
  <div className="text-center py-4">
    <div className="text-5xl mb-3">🎫💳</div>
    <h3 className="text-xl font-bold text-blue-600">예약 접수!</h3>
    <p className="text-gray-600 mt-2">
      선불권 {booking.prepaidHoursUsed}시간 사용 + 
      {booking.amount.toLocaleString()}원 입금 필요
    </p>
  </div>
)}
```

### 7.3 마이페이지 - 예약 목록

```tsx
// 예약 카드에 선불권 사용 표시
<div className="booking-card">
  {/* ... 기존 정보 ... */}
  
  {booking.prepaidHoursUsed > 0 && (
    <div className="mt-2 inline-flex items-center gap-1 
                    bg-purple-100 text-purple-700 
                    px-2 py-1 rounded-full text-xs">
      🎫 선불권 {booking.prepaidHoursUsed}시간 사용
    </div>
  )}
  
  {booking.paymentMethod === 'mixed' && (
    <div className="text-xs text-amber-600 mt-1">
      + 일반 결제 {booking.regularHours}시간 
      ({(booking.regularHours * 14000).toLocaleString()}원)
    </div>
  )}
</div>
```

---

## 8. 엣지 케이스 처리

### 8.1 만료 시점 체크

**규칙**: 선불권은 **예약 시작 시간** 기준으로 유효해야 함

```typescript
// 예약일: 2026-04-10 10:00
// 선불권 만료: 2026-04-10 00:00 (자정)
// → 사용 불가! (예약 시작 시간이 만료 후)

// 쿼리 조건
WHERE expires_at > (booking_date + start_time)::TIMESTAMP
```

### 8.2 동시 예약 방지 (Race Condition)

```sql
-- PostgreSQL 함수에서 SELECT FOR UPDATE 사용
SELECT remaining_hours INTO v_current_remaining
FROM prepaid_purchases
WHERE id = v_purchase_id
FOR UPDATE;  -- 행 수준 잠금
```

이 방식은:
- 동일 선불권에 대한 동시 차감 방지
- 첫 번째 트랜잭션 완료 전까지 두 번째 대기
- 잔여 시간 부족 시 EXCEPTION으로 롤백

### 8.3 선불권 부족 시

| 상황 | 처리 |
|------|------|
| 선불권 0시간 | 일반 예약으로 진행 (입금 대기) |
| 선불권 일부 | 혼합 예약 (선불권 + 입금 대기) |
| 선불권 충분 | 즉시 확정 |

### 8.4 예약 취소 시 선불권 복구

```sql
-- 예약 취소 함수
CREATE OR REPLACE FUNCTION cancel_booking_restore_prepaid(
  p_booking_id UUID
)
RETURNS JSONB AS $$
BEGIN
  -- 1. 예약 상태 변경
  UPDATE bookings
  SET status = 'cancelled', cancelled_at = NOW()
  WHERE id = p_booking_id;
  
  -- 2. 선불권 복구 (prepaid_usages에서 역차감)
  UPDATE prepaid_purchases pp
  SET remaining_hours = remaining_hours + pu.hours_used
  FROM prepaid_usages pu
  WHERE pu.booking_id = p_booking_id
    AND pu.purchase_id = pp.id;
  
  -- 3. 사용 내역 삭제 (또는 soft delete)
  DELETE FROM prepaid_usages WHERE booking_id = p_booking_id;
  
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;
```

### 8.5 혼합 예약 부분 취소

**시나리오**: 선불권 2시간 + 일반 1시간 예약 후, 입금 전 취소

**처리**:
1. 선불권 2시간 복구
2. 일반 1시간 부분은 자동 취소 (입금 안했으므로)
3. 전체 예약 cancelled 상태로 변경

---

## 9. 테스트 시나리오

### 9.1 기본 시나리오

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| T1 | 선불권 충분 | 7시간 보유, 2시간 예약 | 선불권 5시간 남음, 즉시 확정 |
| T2 | 선불권 정확 | 3시간 보유, 3시간 예약 | 선불권 0시간, 즉시 확정 |
| T3 | 선불권 부족 | 2시간 보유, 3시간 예약 | 혼합: 선불권 2h + 일반 1h (14,000원) |
| T4 | 선불권 없음 | 0시간 보유, 2시간 예약 | 일반 예약 (28,000원) |

### 9.2 복합 시나리오

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| T5 | 다중 선불권 | A: 2시간 (4/10 만료), B: 5시간 (7/15 만료), 4시간 예약 | A에서 2시간, B에서 2시간 차감 |
| T6 | 만료 임박 우선 | A: 3시간 (4/5 만료), B: 5시간 (4/30 만료), 2시간 예약 | A에서만 2시간 차감 |
| T7 | 만료된 선불권 | A: 2시간 (만료), B: 3시간 (유효), 4시간 예약 | B 3시간 + 일반 1시간 |

### 9.3 엣지 케이스

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| E1 | 예약일에 만료되는 선불권 | 유효 (당일 자정까지 사용 가능) |
| E2 | 동시에 두 명이 같은 선불권 | 첫 번째만 성공, 두 번째는 "잔여 부족" |
| E3 | 예약 취소 후 선불권 | 복구됨 |
| E4 | 혼합 예약 후 입금 전 취소 | 선불권만 복구 |

### 9.4 세대 회원 시나리오

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| M1 | 세대 회원 + 월 무료 내 | 무료 예약 (선불권 안씀) |
| M2 | 세대 회원 + 월 무료 초과 + 선불권 | 선불권 우선 사용 |
| M3 | 세대 회원 + 무료 초과 + 선불권 없음 | 일반 유료 (14,000원/h) |

---

## 10. 구현 가이드

### 10.1 구현 순서 (코디용)

```
📦 Phase 6.5 구현 순서

Step 1️⃣ DB 마이그레이션 (30분)
├── 014_booking_prepaid_integration.sql 작성
├── 015_booking_prepaid_transaction.sql 작성
└── Supabase에 배포

Step 2️⃣ 유틸 함수 생성 (1시간)
├── lib/prepaid/booking-utils.ts 생성
├── getAvailablePrepaidPurchases() 구현
├── createDeductionPlan() 구현
└── calculateBookingCost() 구현

Step 3️⃣ Server Action 수정 (1시간)
├── app/actions/bookings.ts 수정
├── CreateBookingInput 확장
├── 선불권 조회/차감 로직 추가
└── RPC 함수 호출 연동

Step 4️⃣ API 추가 (30분)
├── POST /api/bookings/preview 생성
└── GET /api/prepaid/my-purchases 확인 (이미 있음)

Step 5️⃣ UI 수정 (1시간)
├── 예약 모달에 선불권 정보 표시
├── 결제 미리보기 섹션 추가
└── 예약 완료 화면 분기 처리

Step 6️⃣ 취소 로직 (30분)
├── cancelBooking() 수정
└── 선불권 복구 로직 추가

Step 7️⃣ 테스트 (1시간)
├── 시나리오 T1~T7 실행
├── 엣지 케이스 E1~E4 확인
└── 세대 회원 M1~M3 확인
```

### 10.2 파일 목록

| 파일 | 변경 유형 | 설명 |
|------|----------|------|
| `supabase/migrations/014_...sql` | 🆕 | 테이블 컬럼 추가 |
| `supabase/migrations/015_...sql` | 🆕 | 트랜잭션 RPC 함수 |
| `lib/prepaid/booking-utils.ts` | 🆕 | 선불권 유틸 함수 |
| `app/actions/bookings.ts` | ✏️ | createBooking 확장 |
| `app/api/bookings/preview/route.ts` | 🆕 | 비용 미리보기 API |
| `app/components/BookingModal.tsx` | ✏️ | UI 변경 |

### 10.3 주의사항

1. **트랜잭션 필수**: 예약 생성과 선불권 차감은 반드시 하나의 트랜잭션에서
2. **행 잠금**: `SELECT FOR UPDATE`로 동시성 문제 방지
3. **만료 체크**: 예약 시작 시간 기준으로 유효성 검사
4. **테스트**: 배포 전 모든 시나리오 테스트 필수

---

## 📎 부록

### A. 관련 파일 경로

```
~/Documents/buzz-workspace/projects/oneum/
├── app/
│   ├── actions/
│   │   └── bookings.ts          # 예약 Server Actions
│   ├── api/
│   │   └── prepaid/
│   │       ├── purchase/        # 구매 신청
│   │       ├── my-purchases/    # 내 선불권 조회
│   │       └── refund/          # 환불
│   └── components/
│       └── PrepaidPurchaseModal.tsx
├── lib/
│   └── prepaid/
│       └── booking-utils.ts     # 🆕 생성 필요
└── supabase/
    └── migrations/
        ├── 013_add_prepaid_tables.sql
        ├── 014_...sql           # 🆕 생성 필요
        └── 015_...sql           # 🆕 생성 필요
```

### B. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-04-02 | 버즈 | 초안 작성 |

---

**문서 끝**
