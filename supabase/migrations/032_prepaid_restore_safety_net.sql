-- Migration 032: 선불권 복구 누락 근본 수정 + 안전장치 + 유실분 복구
--
-- 근본 원인:
--   cancel_booking_restore_prepaid 를 anon/authenticated 권한으로 호출하고 있었고,
--   배포된 함수 본문에 SECURITY DEFINER 가 없었다(016 버전). 그 결과 함수 내부에서
--     1) UPDATE bookings          → bookings RLS 는 느슨해서 성공 (취소 확정)
--     2) UPDATE prepaid_purchases → RLS 가 auth.uid() 기반인데 이 앱은 커스텀 인증이라
--                                    auth.uid() 가 항상 NULL → 0건 처리
--     3) DELETE prepaid_usages    → DELETE 정책 자체가 없음 → 0건 처리
--   RLS 는 UPDATE/DELETE 를 막을 때 예외를 던지지 않고 조용히 0건으로 끝내므로
--   EXCEPTION 블록도 롤백도 발동하지 않았다. 예약만 취소되고 선불권 시간은 영구 유실.
--
--   게다가 반환값 restoredHours 가 실제 복구량이 아니라 bookings.prepaid_hours_used 를
--   그대로 되돌려줘서, 아무것도 복구 안 된 상황이 애플리케이션 로그에 성공으로 찍혔다.
--
-- 대책:
--   (1) 복구 로직을 SECURITY DEFINER 함수로 통일 → 호출자 권한과 무관하게 동작
--   (2) restoredHours 를 실제 복구량으로 정직하게 반환 → 조용한 실패 재발 시 즉시 관측
--   (3) 트리거로 DB 레벨 불변식 강제 → 크론/대시보드 수동 편집/행 삭제까지 전부 커버
--   (4) 기존 유실분 일괄 복구

-- =====================================================
-- 1. 복구 헬퍼: 차감분을 선불권으로 되돌리고 사용내역 삭제. 실제 복구 시간을 반환.
-- =====================================================
CREATE OR REPLACE FUNCTION restore_prepaid_for_booking(p_booking_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_restored NUMERIC(10,1) := 0;
BEGIN
  WITH agg AS (
    SELECT purchase_id, SUM(hours_used) AS hours_used
    FROM prepaid_usages
    WHERE booking_id = p_booking_id
    GROUP BY purchase_id
  ), updated AS (
    UPDATE prepaid_purchases pp
    SET remaining_hours = LEAST(pp.total_hours, pp.remaining_hours + agg.hours_used),
        updated_at = NOW()
    FROM agg
    WHERE agg.purchase_id = pp.id
    RETURNING agg.hours_used
  )
  SELECT COALESCE(SUM(hours_used), 0) INTO v_restored FROM updated;

  DELETE FROM prepaid_usages WHERE booking_id = p_booking_id;

  RETURN v_restored;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. 취소 RPC 재정의 (SECURITY DEFINER + 정직한 restoredHours)
-- =====================================================
CREATE OR REPLACE FUNCTION cancel_booking_restore_prepaid(p_booking_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_booking RECORD;
  v_restored NUMERIC(10,1);
BEGIN
  SELECT * INTO v_booking FROM bookings WHERE id = p_booking_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking not found');
  END IF;

  IF v_booking.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already cancelled');
  END IF;

  UPDATE bookings
  SET status = 'cancelled',
      payment_status = 'refunded',
      cancelled_at = NOW(),
      updated_at = NOW()
  WHERE id = p_booking_id;

  -- 트리거가 이미 복구했으면 여기서는 0 이 반환된다(중복 복구 없음).
  v_restored := restore_prepaid_for_booking(p_booking_id);

  RETURN jsonb_build_object(
    'success', true,
    'restoredHours', v_restored,
    'expectedHours', COALESCE(v_booking.prepaid_hours_used, 0)
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. 트리거: 예약이 'cancelled' 로 전이되면 무조건 복구
--    (앱을 거치지 않은 대시보드 수동 편집·크론까지 커버)
-- =====================================================
CREATE OR REPLACE FUNCTION trg_restore_prepaid_on_cancel()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM restore_prepaid_for_booking(NEW.id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS bookings_restore_prepaid_on_cancel ON bookings;
CREATE TRIGGER bookings_restore_prepaid_on_cancel
  AFTER UPDATE OF status ON bookings
  FOR EACH ROW
  WHEN (NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled')
  EXECUTE FUNCTION trg_restore_prepaid_on_cancel();

-- =====================================================
-- 4. 트리거: 예약 행 직접 삭제 시 CASCADE 전에 복구
--    (prepaid_usages.booking_id 가 ON DELETE CASCADE 라 BEFORE 여야 한다)
-- =====================================================
CREATE OR REPLACE FUNCTION trg_restore_prepaid_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM restore_prepaid_for_booking(OLD.id);
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS bookings_restore_prepaid_on_delete ON bookings;
CREATE TRIGGER bookings_restore_prepaid_on_delete
  BEFORE DELETE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION trg_restore_prepaid_on_delete();

-- =====================================================
-- 5. 기존 유실분 복구
--    이미 취소된 예약인데 사용내역이 남아있는 건 = 복구 누락 건.
--    (정상 복구되었다면 사용내역 행이 삭제되어 있어야 한다.)
-- =====================================================
DO $$
DECLARE
  v_booking_id UUID;
  v_hours NUMERIC(10,1);
  v_bookings INTEGER := 0;
  v_total NUMERIC(10,1) := 0;
BEGIN
  FOR v_booking_id IN
    SELECT DISTINCT pu.booking_id
    FROM prepaid_usages pu
    JOIN bookings b ON b.id = pu.booking_id
    WHERE b.status = 'cancelled'
  LOOP
    v_hours := restore_prepaid_for_booking(v_booking_id);
    v_bookings := v_bookings + 1;
    v_total := v_total + v_hours;
  END LOOP;

  RAISE NOTICE '선불권 복구 누락 예약 %건 / 총 %시간 복구 완료', v_bookings, v_total;
END $$;

COMMENT ON FUNCTION restore_prepaid_for_booking IS
  '예약 차감분을 선불권으로 되돌리고 사용내역을 삭제한다. 실제 복구 시간 반환. 트리거·RPC 공용.';
COMMENT ON FUNCTION cancel_booking_restore_prepaid IS
  '예약 취소 + 선불권 복구 (SECURITY DEFINER, 실제 복구량 반환)';
