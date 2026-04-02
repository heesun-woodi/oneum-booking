# Phase 6.5 구현 가이드 (코디용)

**목적**: 예약 시 선불권 자동 차감 및 혼합 예약 처리 구현  
**예상 시간**: 4~5시간

---

## 📋 작업 체크리스트

- [ ] Step 1: DB 마이그레이션
- [ ] Step 2: 유틸 함수 생성
- [ ] Step 3: Server Action 수정
- [ ] Step 4: API 추가
- [ ] Step 5: UI 수정
- [ ] Step 6: 취소 로직 수정
- [ ] Step 7: 테스트

---

## Step 1: DB 마이그레이션 (30분)

### 1-1. 테이블 컬럼 추가

**파일 생성**: `supabase/migrations/014_booking_prepaid_integration.sql`

```sql
-- Phase 6.5: 예약-선불권 연동 컬럼 추가

-- 1. payment_method 컬럼 추가
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'regular';

-- 기존 데이터 마이그레이션
UPDATE bookings 
SET payment_method = CASE 
  WHEN member_type = 'member' AND amount = 0 THEN 'free'
  WHEN member_type = 'non-member' THEN 'regular'
  ELSE 'regular'
END
WHERE payment_method IS NULL OR payment_method = 'regular';

-- CHECK 제약 추가 (이미 있으면 스킵)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bookings_payment_method_check'
  ) THEN
    ALTER TABLE bookings 
      ADD CONSTRAINT bookings_payment_method_check 
      CHECK (payment_method IN ('free', 'regular', 'prepaid', 'mixed'));
  END IF;
END $$;

-- 2. user_id 컬럼 추가 (로그인 사용자 연결)
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- 3. 인덱스
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method ON bookings(payment_method);
```

### 1-2. 트랜잭션 RPC 함수

**파일 생성**: `supabase/migrations/015_booking_prepaid_rpc.sql`

```sql
-- Phase 6.5: 예약 생성 + 선불권 차감 트랜잭션 함수

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
    NULLIF(p_booking_data->>'household', ''),
    p_booking_data->>'name',
    p_booking_data->>'phone',
    NULLIF(p_booking_data->>'userId', '')::UUID,
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
  
  -- 2. 선불권 차감 (deductionPlan이 있으면)
  IF p_deduction_plan IS NOT NULL AND jsonb_array_length(p_deduction_plan) > 0 THEN
    FOR v_plan IN SELECT * FROM jsonb_array_elements(p_deduction_plan)
    LOOP
      v_purchase_id := (v_plan->>'purchaseId')::UUID;
      v_hours_to_deduct := (v_plan->>'hoursToDeduct')::INTEGER;
      
      -- 현재 잔여 시간 확인 + 행 잠금
      SELECT remaining_hours INTO v_current_remaining
      FROM prepaid_purchases
      WHERE id = v_purchase_id
      FOR UPDATE;
      
      -- 부족하면 예외 발생 (전체 롤백)
      IF v_current_remaining < v_hours_to_deduct THEN
        RAISE EXCEPTION 'Insufficient prepaid hours. Purchase: %, Need: %, Have: %', 
          v_purchase_id, v_hours_to_deduct, v_current_remaining;
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
  END IF;
  
  -- 3. 성공 결과 반환
  RETURN jsonb_build_object(
    'success', true,
    'bookingId', v_booking_id
  );
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;

-- 예약 취소 시 선불권 복구 함수
CREATE OR REPLACE FUNCTION cancel_booking_restore_prepaid(
  p_booking_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
BEGIN
  -- 예약 확인
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id;
  IF v_booking IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;
  
  -- 이미 취소됨
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;
  
  -- 1. 예약 상태 변경
  UPDATE bookings
  SET status = 'cancelled', 
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_booking_id;
  
  -- 2. 선불권 복구
  UPDATE prepaid_purchases pp
  SET remaining_hours = pp.remaining_hours + pu.hours_used,
      updated_at = NOW()
  FROM prepaid_usages pu
  WHERE pu.booking_id = p_booking_id
    AND pu.purchase_id = pp.id;
  
  -- 3. 사용 내역 삭제
  DELETE FROM prepaid_usages WHERE booking_id = p_booking_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'restoredHours', v_booking.prepaid_hours_used
  );
END;
$$ LANGUAGE plpgsql;
```

### 1-3. 마이그레이션 실행

```bash
# Supabase CLI로 실행
cd ~/Documents/buzz-workspace/projects/oneum
supabase db push

# 또는 Supabase Dashboard에서 SQL Editor로 실행
```

---

## Step 2: 유틸 함수 생성 (1시간)

**파일 생성**: `lib/prepaid/booking-utils.ts`

```typescript
import { createServiceRoleClient } from '@/lib/supabase/server'

// ===== 타입 정의 =====

export interface PrepaidPurchase {
  id: string
  user_id: string
  total_hours: number
  remaining_hours: number
  expires_at: string
  status: string
}

export interface DeductionPlan {
  purchaseId: string
  hoursToDeduct: number
}

export interface BookingCost {
  prepaidHours: number
  regularHours: number
  totalHours: number
  amount: number
  paymentMethod: 'free' | 'regular' | 'prepaid' | 'mixed'
}

export interface PrepaidSummary {
  purchases: PrepaidPurchase[]
  totalRemainingHours: number
  earliestExpiry: string | null
}

// ===== 함수 구현 =====

/**
 * 사용자의 유효한 선불권 조회 (만료일 오름차순)
 */
export async function getAvailablePrepaidPurchases(
  userId: string,
  bookingDate: Date
): Promise<PrepaidPurchase[]> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase
    .from('prepaid_purchases')
    .select('id, user_id, total_hours, remaining_hours, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .gt('remaining_hours', 0)
    .gt('expires_at', bookingDate.toISOString())
    .order('expires_at', { ascending: true })
    .order('remaining_hours', { ascending: true })
  
  if (error) {
    console.error('선불권 조회 오류:', error)
    return []
  }
  
  return data || []
}

/**
 * 선불권 요약 정보 조회
 */
export async function getPrepaidSummary(
  userId: string
): Promise<PrepaidSummary> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase
    .from('prepaid_purchases')
    .select('id, user_id, total_hours, remaining_hours, expires_at, status')
    .eq('user_id', userId)
    .eq('status', 'paid')
    .gt('remaining_hours', 0)
    .gt('expires_at', new Date().toISOString())
    .order('expires_at', { ascending: true })
  
  if (error || !data) {
    return { purchases: [], totalRemainingHours: 0, earliestExpiry: null }
  }
  
  const totalRemainingHours = data.reduce((sum, p) => sum + p.remaining_hours, 0)
  const earliestExpiry = data.length > 0 ? data[0].expires_at : null
  
  return { purchases: data, totalRemainingHours, earliestExpiry }
}

/**
 * 선불권 차감 계획 수립
 */
export function createDeductionPlan(
  prepaidPurchases: PrepaidPurchase[],
  hoursNeeded: number
): { plan: DeductionPlan[]; prepaidHours: number; regularHours: number } {
  const plan: DeductionPlan[] = []
  let remainingNeed = hoursNeeded
  
  for (const purchase of prepaidPurchases) {
    if (remainingNeed <= 0) break
    
    const toDeduct = Math.min(remainingNeed, purchase.remaining_hours)
    plan.push({
      purchaseId: purchase.id,
      hoursToDeduct: toDeduct
    })
    remainingNeed -= toDeduct
  }
  
  const prepaidHours = hoursNeeded - remainingNeed
  const regularHours = remainingNeed
  
  return { plan, prepaidHours, regularHours }
}

/**
 * 예약 비용 계산
 */
export async function calculateBookingCost(
  userId: string | undefined,
  hours: number,
  bookingDate: Date,
  isMember: boolean,
  monthlyFreeHoursLeft?: number  // 세대 회원 잔여 무료 시간
): Promise<BookingCost> {
  // 세대 회원이고 무료 시간 남음
  if (isMember && monthlyFreeHoursLeft !== undefined && monthlyFreeHoursLeft >= hours) {
    return {
      prepaidHours: 0,
      regularHours: 0,
      totalHours: hours,
      amount: 0,
      paymentMethod: 'free'
    }
  }
  
  // 로그인 안 했으면 일반 결제
  if (!userId) {
    return {
      prepaidHours: 0,
      regularHours: hours,
      totalHours: hours,
      amount: hours * 14000,
      paymentMethod: 'regular'
    }
  }
  
  // 선불권 조회
  const prepaidPurchases = await getAvailablePrepaidPurchases(userId, bookingDate)
  const { prepaidHours, regularHours } = createDeductionPlan(prepaidPurchases, hours)
  
  // 결제 방식 결정
  let paymentMethod: BookingCost['paymentMethod']
  if (prepaidHours === hours) {
    paymentMethod = 'prepaid'
  } else if (prepaidHours > 0) {
    paymentMethod = 'mixed'
  } else {
    paymentMethod = 'regular'
  }
  
  return {
    prepaidHours,
    regularHours,
    totalHours: hours,
    amount: regularHours * 14000,
    paymentMethod
  }
}

/**
 * 예약 + 선불권 차감 트랜잭션 실행
 */
export async function executeBookingWithPrepaid(
  bookingData: {
    bookingDate: string
    startTime: string
    endTime: string
    space: string
    memberType: string
    household?: string
    name: string
    phone: string
    userId?: string
    prepaidHoursUsed: number
    regularHours: number
    paymentMethod: string
    amount: number
  },
  deductionPlan: DeductionPlan[]
): Promise<{ success: boolean; bookingId?: string; error?: string }> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase.rpc('create_booking_with_prepaid', {
    p_booking_data: bookingData,
    p_deduction_plan: deductionPlan
  })
  
  if (error) {
    console.error('예약 트랜잭션 오류:', error)
    return { success: false, error: error.message }
  }
  
  if (!data.success) {
    return { success: false, error: data.error }
  }
  
  return { success: true, bookingId: data.bookingId }
}

/**
 * 예약 취소 + 선불권 복구
 */
export async function cancelBookingWithRestore(
  bookingId: string
): Promise<{ success: boolean; restoredHours?: number; error?: string }> {
  const supabase = await createServiceRoleClient()
  
  const { data, error } = await supabase.rpc('cancel_booking_restore_prepaid', {
    p_booking_id: bookingId
  })
  
  if (error) {
    console.error('취소 트랜잭션 오류:', error)
    return { success: false, error: error.message }
  }
  
  if (!data.success) {
    return { success: false, error: data.error }
  }
  
  return { success: true, restoredHours: data.restoredHours }
}
```

---

## Step 3: Server Action 수정 (1시간)

**파일 수정**: `app/actions/bookings.ts`

### 3-1. 인터페이스 확장

```typescript
export interface CreateBookingInput {
  bookingDate: string
  times: string[]
  space: 'nolter' | 'soundroom'
  memberType: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
  userId?: string  // 🆕 추가
}

export interface BookingResult {
  success: boolean
  data?: any
  error?: string
  prepaidInfo?: {  // 🆕 추가
    prepaidHoursUsed: number
    regularHours: number
    remainingPrepaidHours: number
    paymentMethod: string
    amountToPay: number
  }
}
```

### 3-2. createBooking 함수 수정

```typescript
import {
  getAvailablePrepaidPurchases,
  createDeductionPlan,
  executeBookingWithPrepaid,
  getPrepaidSummary
} from '@/lib/prepaid/booking-utils'

export async function createBooking(input: CreateBookingInput): Promise<BookingResult> {
  try {
    console.log('🚀 Creating booking:', input)
    
    // ===== 검증 (기존 로직) =====
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const bookingDate = new Date(input.bookingDate)
    bookingDate.setHours(0, 0, 0, 0)
    
    if (bookingDate.getTime() === today.getTime()) {
      return { success: false, error: '당일 예약은 불가능합니다.' }
    }
    if (bookingDate.getTime() < today.getTime()) {
      return { success: false, error: '과거 날짜는 예약할 수 없습니다.' }
    }
    
    // 시간 계산
    const hours = input.times.length
    const startTime = input.times[0]
    const lastHour = parseInt(input.times[input.times.length - 1].split(':')[0])
    const endTime = `${String(lastHour + 1).padStart(2, '0')}:00`
    const normalizedPhone = input.phone.replace(/[^0-9]/g, '')
    
    // ===== 🆕 선불권 처리 =====
    let prepaidHoursUsed = 0
    let regularHours = hours
    let paymentMethod: string = 'regular'
    let amount = 0
    let deductionPlan: any[] = []
    
    if (input.memberType === 'member') {
      // 세대 회원: 무료 (기존 로직)
      prepaidHoursUsed = 0
      regularHours = 0
      paymentMethod = 'free'
      amount = 0
    } else if (input.userId) {
      // 로그인 사용자: 선불권 확인
      const prepaidPurchases = await getAvailablePrepaidPurchases(
        input.userId,
        bookingDate
      )
      
      if (prepaidPurchases.length > 0) {
        const plan = createDeductionPlan(prepaidPurchases, hours)
        deductionPlan = plan.plan
        prepaidHoursUsed = plan.prepaidHours
        regularHours = plan.regularHours
        
        if (prepaidHoursUsed === hours) {
          paymentMethod = 'prepaid'
        } else if (prepaidHoursUsed > 0) {
          paymentMethod = 'mixed'
        }
        
        amount = regularHours * 14000
      } else {
        // 선불권 없음
        amount = hours * 14000
      }
    } else {
      // 비로그인: 일반 결제
      amount = hours * 14000
    }
    
    // ===== 예약 생성 (트랜잭션) =====
    const bookingData = {
      bookingDate: input.bookingDate,
      startTime,
      endTime,
      space: input.space,
      memberType: input.memberType,
      household: input.household || '',
      name: input.name,
      phone: normalizedPhone,
      userId: input.userId || '',
      prepaidHoursUsed,
      regularHours,
      paymentMethod,
      amount
    }
    
    const result = await executeBookingWithPrepaid(bookingData, deductionPlan)
    
    if (!result.success) {
      return { success: false, error: result.error }
    }
    
    // 예약 데이터 조회
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', result.bookingId)
      .single()
    
    // ===== SMS 알림 (기존 로직 + 확장) =====
    // ... SMS 로직 (paymentMethod에 따라 분기)
    
    // ===== 선불권 정보 포함하여 반환 =====
    let remainingPrepaidHours = 0
    if (input.userId) {
      const summary = await getPrepaidSummary(input.userId)
      remainingPrepaidHours = summary.totalRemainingHours
    }
    
    revalidatePath('/')
    
    return {
      success: true,
      data: booking,
      prepaidInfo: {
        prepaidHoursUsed,
        regularHours,
        remainingPrepaidHours,
        paymentMethod,
        amountToPay: amount
      }
    }
  } catch (error: any) {
    console.error('❌ Create booking error:', error)
    return { success: false, error: error.message }
  }
}
```

### 3-3. cancelBooking 함수 수정

```typescript
import { cancelBookingWithRestore } from '@/lib/prepaid/booking-utils'

export async function cancelBooking(bookingId: string) {
  try {
    // 선불권 복구 + 취소 트랜잭션
    const result = await cancelBookingWithRestore(bookingId)
    
    if (!result.success) {
      return { success: false, error: result.error }
    }
    
    // 복구된 시간이 있으면 로그
    if (result.restoredHours && result.restoredHours > 0) {
      console.log(`✅ 선불권 ${result.restoredHours}시간 복구됨`)
    }
    
    // SMS 알림... (기존 로직)
    
    revalidatePath('/')
    return { success: true }
  } catch (error: any) {
    console.error('❌ Cancel booking error:', error)
    return { success: false, error: error.message }
  }
}
```

---

## Step 4: API 추가 (30분)

**파일 생성**: `app/api/bookings/preview/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { calculateBookingCost, getAvailablePrepaidPurchases, createDeductionPlan } from '@/lib/prepaid/booking-utils'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const { userId, hours, bookingDate } = await request.json()
    
    if (!hours || !bookingDate) {
      return NextResponse.json(
        { success: false, error: '필수 파라미터 누락' },
        { status: 400 }
      )
    }
    
    const date = new Date(bookingDate)
    const cost = await calculateBookingCost(userId, hours, date, false)
    
    // 상세 정보
    let prepaidDetail: any[] = []
    if (userId) {
      const purchases = await getAvailablePrepaidPurchases(userId, date)
      const { plan } = createDeductionPlan(purchases, hours)
      prepaidDetail = plan.map(p => {
        const purchase = purchases.find(pur => pur.id === p.purchaseId)
        return {
          purchaseId: p.purchaseId,
          hoursToUse: p.hoursToDeduct,
          expiresAt: purchase?.expires_at
        }
      })
    }
    
    return NextResponse.json({
      success: true,
      cost,
      prepaidDetail
    })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
```

---

## Step 5: UI 수정 (1시간)

### 5-1. 예약 모달에 선불권 정보 추가

예약 모달 컴포넌트에서:

1. `userId` prop 추가
2. 선불권 요약 정보 조회 (`/api/prepaid/my-purchases`)
3. 상단에 "🎫 보유 선불권: X시간" 표시
4. 시간 선택 후 `/api/bookings/preview` 호출하여 비용 미리보기
5. 결제 정보 섹션 추가 (선불권/혼합/일반 분기)

### 5-2. 예약 완료 화면 분기

```tsx
{result.prepaidInfo?.paymentMethod === 'prepaid' && (
  <div>✅ 선불권으로 예약 완료!</div>
)}

{result.prepaidInfo?.paymentMethod === 'mixed' && (
  <div>
    🎫 선불권 {result.prepaidInfo.prepaidHoursUsed}시간 사용
    + 💳 {result.prepaidInfo.amountToPay.toLocaleString()}원 입금 필요
  </div>
)}
```

---

## Step 6: 취소 로직 수정 (이미 완료)

Step 3-3에서 `cancelBooking` 함수 수정 완료

---

## Step 7: 테스트 (1시간)

### 테스트 시나리오

```
✅ T1: 선불권 7시간 보유 → 2시간 예약 → 5시간 남음
✅ T2: 선불권 3시간 보유 → 3시간 예약 → 0시간 남음
✅ T3: 선불권 2시간 보유 → 3시간 예약 → 혼합 (2h + 14,000원)
✅ T4: 선불권 없음 → 2시간 예약 → 28,000원
✅ T5: 다중 선불권 → 만료일 가까운 것 먼저 차감
✅ T6: 예약 취소 → 선불권 복구
```

### 배포 체크리스트

- [ ] Supabase 마이그레이션 실행
- [ ] `npm run build` 성공
- [ ] Vercel 배포
- [ ] 테스트 시나리오 T1~T6 통과

---

## 📎 참고 파일

| 파일 | 용도 |
|------|------|
| `docs/PHASE_6.5_DESIGN.md` | 상세 설계 문서 |
| `supabase/migrations/014_*.sql` | 컬럼 추가 |
| `supabase/migrations/015_*.sql` | RPC 함수 |
| `lib/prepaid/booking-utils.ts` | 유틸 함수 |
| `app/actions/bookings.ts` | Server Actions |
| `app/api/bookings/preview/route.ts` | 비용 미리보기 |

---

**작성일**: 2026-04-02  
**작성자**: 버즈 (Subagent)
