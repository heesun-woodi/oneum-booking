-- Migration 019: cancel_booking_restore_prepaid RPC 함수
-- 예약 취소 시 선불권 시간 복구를 원자적으로 처리
-- Migration 016의 함수를 현재 스키마(payment_status 컬럼)에 맞게 재작성

CREATE OR REPLACE FUNCTION cancel_booking_restore_prepaid(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
BEGIN
  -- 예약 조회 + 행 잠금 (동시 취소 방지)
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;

  -- 1. 예약 취소 처리
  UPDATE bookings
  SET status = 'cancelled',
      payment_status = 'refunded',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- 2. 선불권 시간 복구 (prepaid_usages → prepaid_purchases)
  UPDATE prepaid_purchases pp
  SET remaining_hours = pp.remaining_hours + pu.hours_used,
      updated_at = NOW()
  FROM prepaid_usages pu
  WHERE pu.booking_id = p_booking_id
    AND pu.purchase_id = pp.id;

  -- 3. 선불권 사용 내역 삭제
  DELETE FROM prepaid_usages WHERE booking_id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'restoredHours', COALESCE(v_booking.prepaid_hours_used, 0)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
