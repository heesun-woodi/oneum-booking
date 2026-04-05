# 선불권 버그 수정 플랜

**작성일**: 2026-04-04  
**대상 버그**: 2개 (예약 취소 시 선불권 미복구, 동시 예약 시 중복 차감)

---

## 요구사항 요약

### Bug 1 🔴 예약 취소 시 선불권 복구 미구현
- `cancelBooking()` (app/actions/bookings.ts:235)이 bookings 테이블만 UPDATE
- `prepaid_usages` 삭제, `prepaid_purchases.remaining_hours` 복구 없음
- `cancel_booking_restore_prepaid` RPC 함수가 migration 016에만 존재 (현재 DB에 없을 수 있음)
- 선불권 사용 예약(payment_status='prepaid') 취소 시 SMS 알림 미처리

### Bug 2 🔴 동시 예약 시 선불권 중복 차감 가능
- migration 017의 `create_booking_with_prepaid` 함수에 `FOR UPDATE` 행 잠금 없음
- 동시에 두 예약이 같은 선불권의 remaining_hours를 읽으면 중복 차감 발생

---

## 수용 기준 (Acceptance Criteria)

- [ ] 선불권 사용 예약 취소 시 `prepaid_purchases.remaining_hours`가 취소 전 값으로 복원됨
- [ ] 취소 후 `prepaid_usages` 레코드가 삭제됨
- [ ] 동시에 2개 예약 요청이 들어와도 선불권 잔여 시간이 음수가 되지 않음
- [ ] payment_status='prepaid' 예약 취소 시 사용자에게 알림 발송됨
- [ ] `npm run build` 성공
- [ ] 일반 예약(선불권 미사용)의 취소 흐름은 기존과 동일하게 동작

---

## 구현 단계

### Step 1: Migration 019 생성 — cancel RPC 함수

**파일**: `supabase/migrations/019_cancel_booking_restore_prepaid.sql`

migration 016의 `cancel_booking_restore_prepaid`를 현재 스키마(payment_status 컬럼 포함)에 맞게 재작성:

```sql
CREATE OR REPLACE FUNCTION cancel_booking_restore_prepaid(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking bookings%ROWTYPE;
  v_restored_hours INTEGER := 0;
BEGIN
  -- 예약 조회 및 잠금
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;
  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;

  -- 예약 취소
  UPDATE bookings
  SET status = 'cancelled',
      payment_status = 'refunded',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- 선불권 복구 (prepaid_usages → prepaid_purchases)
  UPDATE prepaid_purchases pp
  SET remaining_hours = pp.remaining_hours + pu.hours_used,
      updated_at = NOW()
  FROM prepaid_usages pu
  WHERE pu.booking_id = p_booking_id AND pu.purchase_id = pp.id;

  GET DIAGNOSTICS v_restored_hours = ROW_COUNT;

  -- 사용 내역 삭제
  DELETE FROM prepaid_usages WHERE booking_id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'restoredHours', COALESCE(v_booking.prepaid_hours_used, 0)
  );
END;
$$ LANGUAGE plpgsql;
```

### Step 2: Migration 020 생성 — FOR UPDATE 동시성 수정

**파일**: `supabase/migrations/020_fix_prepaid_concurrency.sql`

migration 017의 `create_booking_with_prepaid` 함수에 `FOR UPDATE` 추가:

```sql
-- 선불권 차감 전 행 잠금 추가
SELECT id, remaining_hours
INTO v_purchase_id, v_remaining
FROM prepaid_purchases
WHERE user_id = p_user_id
  AND status = 'paid'
  AND remaining_hours > 0
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY expires_at ASC NULLS LAST
LIMIT 1
FOR UPDATE;  -- ← 이 줄 추가
```

전체 함수를 `CREATE OR REPLACE`로 재정의.

### Step 3: cancelBooking 함수 수정

**파일**: `app/actions/bookings.ts` (cancelBooking 함수, line ~235)

```typescript
export async function cancelBooking(bookingId: string) {
  try {
    // 1. 예약 상태 조회
    const { data: booking } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (!booking) return { success: false, error: '예약을 찾을 수 없습니다' }
    if (booking.status === 'cancelled') return { success: false, error: '이미 취소된 예약입니다' }

    // 2. 선불권 사용 예약인 경우 RPC로 취소 + 복구 (원자적)
    if (booking.prepaid_hours_used > 0) {
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('cancel_booking_restore_prepaid', { p_booking_id: bookingId })

      if (rpcError || !rpcData?.success) {
        return { success: false, error: '선불권 복구 중 오류가 발생했습니다' }
      }
    } else {
      // 3. 일반 예약 취소 (기존 로직)
      const { error } = await supabase
        .from('bookings')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', bookingId)

      if (error) throw error
    }

    // 4. SMS 알림 분기
    if (booking.payment_status === 'completed') {
      // 기존: 일반 결제 취소 SMS
    } else if (booking.prepaid_hours_used > 0) {
      // 신규: 선불권 취소 SMS (복구된 시간 안내)
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
```

### Step 4: 빌드 및 검증

```bash
npm run build
```

---

## 위험 및 대응

| 위험 | 대응 |
|------|------|
| DB에 migration 016~018이 미실행 상태일 수 있음 | Supabase Dashboard에서 실행 여부 확인 후 순서대로 실행 |
| `cancel_booking_restore_prepaid`가 이미 DB에 있을 수 있음 | `CREATE OR REPLACE`로 안전하게 덮어쓰기 |
| FOR UPDATE 추가로 기존 트랜잭션 락 대기 시간 증가 | 함수 실행 시간이 짧아 실용적으로 문제없음 |
| 선불권 없는 일반 예약의 cancelBooking 동작 변화 | prepaid_hours_used=0 조건으로 기존 경로 유지 |

---

## 작업 순서

1. `019_cancel_booking_restore_prepaid.sql` 작성
2. `020_fix_prepaid_concurrency.sql` 작성
3. `app/actions/bookings.ts` cancelBooking 수정
4. `npm run build` 확인
5. Supabase Dashboard에서 019, 020 마이그레이션 실행 (수동)
6. 실제 테스트: 선불권 예약 생성 → 취소 → 잔여 시간 복구 확인
