-- Migration 020: 선불권 동시성 버그 수정
-- 문제: create_booking_with_prepaid의 FOR LOOP SELECT에 FOR UPDATE가 없어
--       동시 예약 시 같은 선불권을 중복 차감할 수 있음
-- 해결: FOR LOOP 쿼리에 FOR UPDATE 추가

DROP FUNCTION IF EXISTS create_booking_with_prepaid(UUID, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER);

CREATE OR REPLACE FUNCTION create_booking_with_prepaid(
  p_user_id UUID,
  p_booking_date DATE,
  p_start_time TEXT,
  p_end_time TEXT,
  p_space TEXT,
  p_member_type TEXT,
  p_household TEXT,
  p_name TEXT,
  p_phone TEXT,
  p_requested_hours INTEGER
)
RETURNS TABLE(
  booking_id UUID,
  prepaid_hours_used INTEGER,
  regular_hours INTEGER,
  amount INTEGER,
  booking_status TEXT,
  booking_payment_status TEXT
) AS $$
DECLARE
  v_booking_id UUID;
  v_prepaid_hours_used INTEGER := 0;
  v_regular_hours INTEGER := 0;
  v_amount INTEGER := 0;
  v_status TEXT;
  v_payment_status TEXT;
  v_remaining_hours INTEGER;
  v_purchase_record RECORD;
  v_hours_to_deduct INTEGER;
  v_usage_records UUID[] := '{}';
  v_usage_hours INTEGER[] := '{}';
BEGIN
  v_remaining_hours := p_requested_hours;

  FOR v_purchase_record IN
    SELECT id, remaining_hours
    FROM prepaid_purchases
    WHERE user_id = p_user_id
      AND status = 'paid'
      AND expires_at > NOW()
      AND remaining_hours > 0
    ORDER BY expires_at ASC, remaining_hours ASC
    FOR UPDATE  -- 동시 예약 시 행 잠금으로 중복 차감 방지
  LOOP
    v_hours_to_deduct := LEAST(v_purchase_record.remaining_hours, v_remaining_hours);

    UPDATE prepaid_purchases
    SET remaining_hours = remaining_hours - v_hours_to_deduct,
        updated_at = NOW()
    WHERE id = v_purchase_record.id;

    v_usage_records := array_append(v_usage_records, v_purchase_record.id);
    v_usage_hours := array_append(v_usage_hours, v_hours_to_deduct);

    v_prepaid_hours_used := v_prepaid_hours_used + v_hours_to_deduct;
    v_remaining_hours := v_remaining_hours - v_hours_to_deduct;

    EXIT WHEN v_remaining_hours = 0;
  END LOOP;

  v_regular_hours := v_remaining_hours;

  IF v_prepaid_hours_used = p_requested_hours THEN
    v_status := 'confirmed';
    v_payment_status := 'prepaid';
    v_amount := 0;
  ELSIF v_prepaid_hours_used > 0 THEN
    v_status := 'pending';
    v_payment_status := 'pending';
    v_amount := v_regular_hours * 14000;
  ELSIF p_member_type = 'member' THEN
    v_status := 'confirmed';
    v_payment_status := 'completed';
    v_amount := 0;
  ELSE
    v_status := 'pending';
    v_payment_status := 'pending';
    v_amount := v_regular_hours * 14000;
  END IF;

  INSERT INTO bookings (
    user_id, booking_date, start_time, end_time, space,
    member_type, household, name, phone, amount,
    status, payment_status, prepaid_hours_used, regular_hours, payment_method
  ) VALUES (
    p_user_id,
    p_booking_date,
    p_start_time::TIME,
    p_end_time::TIME,
    p_space,
    p_member_type,
    p_household,
    p_name,
    p_phone,
    v_amount,
    v_status,
    v_payment_status,
    v_prepaid_hours_used,
    v_regular_hours,
    CASE
      WHEN v_prepaid_hours_used = p_requested_hours THEN 'prepaid'
      WHEN v_prepaid_hours_used > 0 THEN 'mixed'
      WHEN p_member_type = 'member' THEN 'free'
      ELSE 'regular'
    END
  )
  RETURNING id INTO v_booking_id;

  FOR i IN 1..array_length(v_usage_records, 1) LOOP
    INSERT INTO prepaid_usages (purchase_id, booking_id, hours_used)
    VALUES (v_usage_records[i], v_booking_id, v_usage_hours[i]);
  END LOOP;

  RETURN QUERY SELECT
    v_booking_id,
    v_prepaid_hours_used,
    v_regular_hours,
    v_amount,
    v_status,
    v_payment_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
