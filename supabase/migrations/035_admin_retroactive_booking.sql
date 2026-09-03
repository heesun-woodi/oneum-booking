-- 관리자 소급 등록 (예약 없이 사용한 건의 사후 기록)
--
-- 배경:
--   예약을 하지 않고 공간을 쓴 경우(요일 착각 등) 운영자가 사용 사실을 남기고
--   선불권을 차감해야 한다. 그런데 createBooking() 은 과거 날짜를 차단하고,
--   관리자 화면에는 예약 '생성' 기능 자체가 없어서 매번 service role 키로
--   RPC 를 직접 호출해야 했다. 그 경로는 기록도 남지 않는다.
--
--   실제 사례: 2026-09-02 릴라 놀터 17:00~18:00 (수동 RPC 호출로 처리)
--
-- 이 마이그레이션이 하는 일은 두 가지다.
--   1) 소급 등록을 '누가, 왜' 했는지 남길 컬럼 추가
--   2) RPC 가 그 두 값을 함께 저장하도록 확장 (034 기반, 나머지 동작은 동일)
--
--   과금·중복·선불권 로직은 손대지 않는다. 소급 등록도 일반 예약과 똑같이
--   무료 → 선불권 → 현금 순서를 타야 하기 때문이다.
--
-- 작성일: 2026-09-03

BEGIN;

-- =====================================================
-- 1. 감사 컬럼
--    둘 다 NULL 이면 '사용자가 직접 만든 일반 예약'이라는 뜻이다.
--    기존 행은 전부 NULL 이 되므로 별도 백필이 필요 없다.
-- =====================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS created_by_admin UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS admin_note TEXT;

COMMENT ON COLUMN bookings.created_by_admin IS
  '이 예약을 소급 등록한 관리자의 users.id. NULL 이면 사용자가 직접 만든 예약이다.';
COMMENT ON COLUMN bookings.admin_note IS
  '소급 등록 사유 메모. created_by_admin 이 있을 때만 의미가 있다.';

-- 소급 등록분만 뽑아보는 조회가 관리 화면의 기본 용도라 부분 인덱스로 충분하다.
CREATE INDEX IF NOT EXISTS idx_bookings_created_by_admin
  ON bookings (created_by_admin, booking_date DESC)
  WHERE created_by_admin IS NOT NULL;

COMMIT;

-- =====================================================
-- 2. 예약 생성 RPC 갱신 (034 기반)
--    추가된 것은 createdByAdmin / adminNote 두 필드의 저장뿐이다.
--    034 의 슬롯 중복 검사, 무료 한도 검증, 선불권 차감은 그대로 유지한다.
--
--    빈 문자열을 NULL 로 접는 이유: 호출측이 항상 키를 채워 보내기 때문에
--    ''(공개 예약)과 실제 UUID(소급 등록)를 여기서 갈라야 한다.
-- =====================================================
BEGIN;

CREATE OR REPLACE FUNCTION create_booking_with_prepaid(
  p_booking_data   JSONB,
  p_deduction_plan JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_booking_id  UUID;
  v_plan        JSONB;
  v_purchase_id UUID;
  v_to_deduct   NUMERIC(10,1);
  v_remaining   NUMERIC(10,1);

  v_space     TEXT          := p_booking_data->>'space';
  v_household TEXT          := NULLIF(btrim(COALESCE(p_booking_data->>'household', '')), '');
  v_date      DATE          := (p_booking_data->>'bookingDate')::DATE;
  v_start     TIME          := (p_booking_data->>'startTime')::TIME;
  v_end       TIME          := (p_booking_data->>'endTime')::TIME;
  v_free      NUMERIC(10,1) := COALESCE((p_booking_data->>'freeHoursUsed')::NUMERIC, 0);
  v_prepaid   NUMERIC(10,1) := COALESCE((p_booking_data->>'prepaidHoursUsed')::NUMERIC, 0);
  v_regular   NUMERIC(10,1) := COALESCE((p_booking_data->>'regularHours')::NUMERIC, 0);
  v_amount    INTEGER       := COALESCE((p_booking_data->>'amount')::INTEGER, 0);
  v_limit     NUMERIC(10,1) := COALESCE((p_booking_data->>'freeHoursLimit')::NUMERIC, 20);
  v_consent   BOOLEAN       := COALESCE((p_booking_data->>'piiConsentGiven')::BOOLEAN, false);

  -- 소급 등록 감사 필드 (일반 예약에서는 둘 다 NULL)
  v_admin     UUID          := NULLIF(btrim(COALESCE(p_booking_data->>'createdByAdmin', '')), '')::UUID;
  v_note      TEXT          := NULLIF(btrim(COALESCE(p_booking_data->>'adminNote', '')), '');

  v_taken       TEXT;
  v_month_start DATE;
  v_used        NUMERIC(10,1);
  v_status      TEXT;
  v_pay_status  TEXT;
BEGIN
  -- ---- 0. 시간 유효성 ----
  -- 뒤집힌 구간은 tsrange() 를 깨뜨리고, 빈 구간은 EXCLUDE 제약을 통과해 버린다.
  IF v_end <= v_start THEN
    RETURN jsonb_build_object(
      'success', false,
      'code',    'INVALID_TIME_RANGE',
      'error',   format('종료 시각(%s)이 시작 시각(%s)보다 뒤여야 합니다.', v_end, v_start)
    );
  END IF;

  -- ---- 0-1. 슬롯 점유 검사 ----
  -- 무료시간/선불권 계산보다 먼저 본다. 슬롯이 찼으면 나머지는 볼 필요가 없다.
  -- 이것만으로 경합이 막히지는 않는다 (READ COMMITTED 팬텀 INSERT).
  -- 실제 보증은 bookings_no_overlap 제약이 하고, 여기서는 안내 문구를 만들 뿐이다.
  SELECT string_agg(to_char(start_time, 'HH24:MI') || '~' || to_char(end_time, 'HH24:MI'), ', ')
    INTO v_taken
  FROM bookings
  WHERE space = v_space
    AND booking_date = v_date
    AND status IS DISTINCT FROM 'cancelled'
    AND start_time < v_end
    AND end_time   > v_start;

  IF v_taken IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success',    false,
      'code',       'SLOT_TAKEN',
      'error',      format('이미 예약된 시간대입니다 (%s).', v_taken),
      'takenSlots', v_taken
    );
  END IF;

  -- ---- 1. 놀터 무료 한도 검증 (2026-08-01 사용분부터) ----
  IF v_space = 'nolter' AND v_household IS NOT NULL AND v_free > 0
     AND v_date >= DATE '2026-08-01' THEN
    v_month_start := date_trunc('month', v_date)::DATE;

    PERFORM pg_advisory_xact_lock(
      hashtext('oneum:free_hours:' || v_household || ':' || to_char(v_month_start, 'YYYY-MM'))
    );

    SELECT COALESCE(SUM(free_hours_used), 0) INTO v_used
    FROM bookings
    WHERE household = v_household
      AND space = 'nolter'
      AND status <> 'cancelled'
      AND booking_date >= v_month_start
      AND booking_date <  (v_month_start + INTERVAL '1 month')::DATE;

    IF v_used + v_free > v_limit THEN
      RETURN jsonb_build_object(
        'success',        false,
        'code',           'FREE_HOURS_EXCEEDED',
        'error',          format('무료 시간 한도 초과 (사용 %s / 한도 %s, 요청 %s)', v_used, v_limit, v_free),
        'freeHoursUsed',  v_used,
        'freeHoursLimit', v_limit
      );
    END IF;
  END IF;

  -- ---- 2. 상태 판정: 받을 돈이 남아 있으면 미입금(pending) ----
  IF v_amount > 0 THEN
    v_status := 'pending';   v_pay_status := 'pending';
  ELSE
    v_status := 'confirmed'; v_pay_status := 'completed';
  END IF;

  -- ---- 3. 예약 생성 ----
  INSERT INTO bookings (
    booking_date, start_time, end_time, space,
    member_type, household, name, phone, user_id,
    free_hours_used, prepaid_hours_used, regular_hours,
    payment_method, amount, status, payment_status,
    pii_consent_given, pii_consent_at,
    created_by_admin, admin_note
  )
  VALUES (
    v_date, v_start, v_end, v_space,
    p_booking_data->>'memberType',
    v_household,
    p_booking_data->>'name',
    p_booking_data->>'phone',
    CASE WHEN COALESCE(p_booking_data->>'userId', '') = '' THEN NULL
         ELSE (p_booking_data->>'userId')::UUID END,
    v_free,
    v_prepaid,
    v_regular,
    COALESCE(p_booking_data->>'paymentMethod', 'regular'),
    v_amount,
    v_status,
    v_pay_status,
    v_consent,
    CASE WHEN v_consent THEN NOW() ELSE NULL END,
    v_admin,
    v_note
  )
  RETURNING id INTO v_booking_id;

  -- ---- 4. 선불권 차감 ----
  IF p_deduction_plan IS NOT NULL AND jsonb_array_length(p_deduction_plan) > 0 THEN
    FOR v_plan IN SELECT * FROM jsonb_array_elements(p_deduction_plan)
    LOOP
      v_purchase_id := (v_plan->>'purchaseId')::UUID;
      v_to_deduct   := (v_plan->>'hoursToDeduct')::NUMERIC;

      SELECT remaining_hours INTO v_remaining
      FROM prepaid_purchases WHERE id = v_purchase_id FOR UPDATE;

      IF v_remaining IS NULL THEN
        RAISE EXCEPTION 'Prepaid purchase not found: %', v_purchase_id;
      END IF;
      IF v_remaining < v_to_deduct THEN
        RAISE EXCEPTION 'Insufficient prepaid hours. Purchase: %, Need: %, Have: %',
          v_purchase_id, v_to_deduct, v_remaining;
      END IF;

      UPDATE prepaid_purchases
      SET remaining_hours = remaining_hours - v_to_deduct, updated_at = NOW()
      WHERE id = v_purchase_id;

      INSERT INTO prepaid_usages (purchase_id, booking_id, hours_used)
      VALUES (v_purchase_id, v_booking_id, v_to_deduct);
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success',       true,
    'bookingId',     v_booking_id,
    'status',        v_status,
    'paymentStatus', v_pay_status
  );

EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object(
      'success', false,
      'code',    'SLOT_TAKEN',
      'error',   '이미 예약된 시간대입니다.'
    );
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'code', 'EXCEPTION', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_with_prepaid(JSONB, JSONB) TO anon, authenticated;

COMMENT ON FUNCTION create_booking_with_prepaid(JSONB, JSONB) IS
  '예약 생성 + 슬롯 중복 검증 + 세대 무료시간 한도 검증 + 선불권 차감 (단일 트랜잭션). '
  '중복은 SLOT_TAKEN, 무료시간 초과는 FREE_HOURS_EXCEEDED 로 반환한다. '
  'createdByAdmin/adminNote 가 오면 소급 등록으로 기록한다.';

COMMIT;
