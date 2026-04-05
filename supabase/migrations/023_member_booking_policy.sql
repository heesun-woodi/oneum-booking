-- Phase 7: 온음 세대 회원 예약 정책 변경
-- 놀터: 월 3회 무료(건수 기준, 세대 단위), 이후 10,000원/건
-- 방음실: 무제한 무료
-- 작성일: 2026-04-05

-- =====================================================
-- 1. payment_method CHECK 제약에 'nolter_paid' 추가
-- =====================================================
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('free', 'regular', 'prepaid', 'mixed', 'nolter_paid'));

-- =====================================================
-- 2. 020_fix_prepaid_concurrency.sql의 미사용 개별파라미터 RPC DROP
--    (016의 JSONB 버전이 실제 사용 중이므로 020 오버로드만 제거)
-- =====================================================
DROP FUNCTION IF EXISTS create_booking_with_prepaid(
  UUID, DATE, TIME, TIME, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER, JSONB
);
-- 020에 추가된 다른 시그니처들도 정리
DROP FUNCTION IF EXISTS create_booking_with_prepaid(
  p_user_id UUID,
  p_booking_date DATE,
  p_start_time TIME,
  p_end_time TIME,
  p_space TEXT,
  p_member_type TEXT,
  p_household TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_amount INTEGER,
  p_deduction_plan JSONB
);

-- =====================================================
-- 3. 016 JSONB RPC에 SECURITY DEFINER 추가
--    (anon key로 호출해도 bookings 테이블에 안전하게 접근)
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
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 4. GRANT (anon key로 호출 가능하도록)
-- =====================================================
GRANT EXECUTE ON FUNCTION create_booking_with_prepaid(JSONB, JSONB) TO anon, authenticated;

-- =====================================================
-- 5. site_settings 요금 안내 문구 업데이트
-- =====================================================
UPDATE site_settings
SET value = REPLACE(
  REPLACE(value,
    '무료 (월 8시간까지)',
    '놀터: 월 3회 무료 / 방음실: 무료 (무제한)'
  ),
  '14,000원/시간',
  '놀터 초과 시 10,000원/건 / 방음실 14,000원/시간'
),
updated_at = NOW()
WHERE key = 'spaces_info';

-- =====================================================
-- 완료
-- =====================================================
COMMENT ON FUNCTION create_booking_with_prepaid IS
  '예약 생성 + 선불권 차감 트랜잭션 (SECURITY DEFINER, Phase 7 업데이트)';
