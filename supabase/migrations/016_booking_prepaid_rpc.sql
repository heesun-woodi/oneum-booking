-- Phase 6.5: 예약 생성 + 선불권 차감 트랜잭션 함수
-- 작성일: 2026-04-03

-- =====================================================
-- 1. 예약 생성 + 선불권 차감 트랜잭션 함수
-- =====================================================
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

-- =====================================================
-- 2. 예약 취소 + 선불권 복구 함수
-- =====================================================
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

-- =====================================================
-- 완료
-- =====================================================
COMMENT ON FUNCTION create_booking_with_prepaid IS '예약 생성 + 선불권 차감 트랜잭션';
COMMENT ON FUNCTION cancel_booking_restore_prepaid IS '예약 취소 + 선불권 복구 트랜잭션';
