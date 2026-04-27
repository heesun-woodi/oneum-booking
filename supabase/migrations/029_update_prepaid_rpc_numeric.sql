-- 선불권 RPC 함수 NUMERIC 타입으로 업데이트
DROP FUNCTION IF EXISTS create_booking_with_prepaid(JSONB, JSONB) CASCADE;
DROP FUNCTION IF EXISTS create_booking_with_prepaid CASCADE;

CREATE OR REPLACE FUNCTION create_booking_with_prepaid(
  p_booking_data JSONB,
  p_deduction_plan JSONB
)
RETURNS JSONB AS $$
DECLARE
  v_booking_id UUID;
  v_plan JSONB;
  v_purchase_id UUID;
  v_hours_to_deduct NUMERIC(10,1);
  v_current_remaining NUMERIC(10,1);
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
    COALESCE((p_booking_data->>'prepaidHoursUsed')::NUMERIC, 0),
    COALESCE((p_booking_data->>'regularHours')::NUMERIC, 0),
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

  -- 2. 선불권 차감
  IF p_deduction_plan IS NOT NULL AND jsonb_array_length(p_deduction_plan) > 0 THEN
    FOR v_plan IN SELECT * FROM jsonb_array_elements(p_deduction_plan)
    LOOP
      v_purchase_id := (v_plan->>'purchaseId')::UUID;
      v_hours_to_deduct := (v_plan->>'hoursToDeduct')::NUMERIC;

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

      UPDATE prepaid_purchases
      SET remaining_hours = remaining_hours - v_hours_to_deduct,
          updated_at = NOW()
      WHERE id = v_purchase_id;

      INSERT INTO prepaid_usages (purchase_id, booking_id, hours_used)
      VALUES (v_purchase_id, v_booking_id, v_hours_to_deduct);
    END LOOP;
  END IF;

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

COMMENT ON FUNCTION create_booking_with_prepaid IS '예약 생성 + 선불권 차감 트랜잭션 (NUMERIC 시간 지원)';
