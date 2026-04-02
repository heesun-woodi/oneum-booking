-- =====================================================
-- Phase 6.5: 예약-선불권 연동 마이그레이션 (통합본)
-- 작성일: 2026-04-03
-- 설명: Supabase Dashboard SQL Editor에서 실행하세요
-- =====================================================

-- =====================================================
-- PART 1: 테이블 컬럼 추가
-- =====================================================

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
WHERE payment_method = 'regular';

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

-- 3. payment_status 컬럼 추가
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';

-- CHECK 제약 추가
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bookings_payment_status_check'
  ) THEN
    ALTER TABLE bookings 
      ADD CONSTRAINT bookings_payment_status_check 
      CHECK (payment_status IN ('pending', 'completed', 'refunded'));
  END IF;
END $$;

-- 기존 데이터 마이그레이션
UPDATE bookings 
SET payment_status = CASE 
  WHEN status IN ('confirmed', 'paid') THEN 'completed'
  WHEN status = 'cancelled' THEN 'refunded'
  ELSE 'pending'
END
WHERE payment_status = 'pending';

-- 4. cancelled_at 컬럼 추가 (취소 시점 기록)
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- 5. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method ON bookings(payment_method);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);

-- 컬럼 코멘트
COMMENT ON COLUMN bookings.payment_method IS '결제 방식: free(세대회원무료), regular(일반결제), prepaid(선불권), mixed(혼합)';
COMMENT ON COLUMN bookings.user_id IS '로그인 사용자 ID (선불권 사용자 추적)';
COMMENT ON COLUMN bookings.payment_status IS '결제 상태: pending(대기), completed(완료), refunded(환불)';
COMMENT ON COLUMN bookings.cancelled_at IS '예약 취소 시점';

-- =====================================================
-- PART 2: RPC 트랜잭션 함수
-- =====================================================

-- 1. 예약 생성 + 선불권 차감 트랜잭션 함수
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
    CASE 
      WHEN p_booking_data->>'userId' = '' THEN NULL
      ELSE (p_booking_data->>'userId')::UUID
    END,
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
      
      -- 현재 잔여 시간 확인 + 행 잠금 (동시성 방지)
      SELECT remaining_hours INTO v_current_remaining
      FROM prepaid_purchases
      WHERE id = v_purchase_id
      FOR UPDATE;
      
      -- 부족하면 예외 발생 (전체 롤백)
      IF v_current_remaining IS NULL THEN
        RAISE EXCEPTION 'Prepaid purchase not found: %', v_purchase_id;
      END IF;
      
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
  -- 모든 변경 롤백됨 (PostgreSQL 기본 동작)
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;

-- 2. 예약 취소 + 선불권 복구 함수
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
      payment_status = 'refunded',
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
  
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql;

-- 함수 코멘트
COMMENT ON FUNCTION create_booking_with_prepaid IS '예약 생성 + 선불권 차감 트랜잭션';
COMMENT ON FUNCTION cancel_booking_restore_prepaid IS '예약 취소 + 선불권 복구 트랜잭션';

-- =====================================================
-- 완료!
-- =====================================================
-- ✅ 테이블 컬럼 추가: payment_method, user_id, payment_status, cancelled_at
-- ✅ RPC 함수 추가: create_booking_with_prepaid, cancel_booking_restore_prepaid
-- =====================================================
