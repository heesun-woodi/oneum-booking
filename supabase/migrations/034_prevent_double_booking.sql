-- 예약 시간대 중복(더블부킹) 차단
--
-- 배경:
--   지금까지 '이 슬롯이 이미 찼는가'를 검사하는 곳이 클라이언트 UI 뿐이었다.
--   app/page.tsx 는 currentMonth / selectedSpace 가 바뀔 때만 예약 목록을 다시 읽으므로,
--   탭을 열어둔 사이에 다른 사람이 예약하면 그 슬롯이 계속 '비어 있음'으로 보인다.
--   서버 액션(createBooking)과 RPC 는 무료시간·선불권만 검증하고 겹침은 보지 않았기 때문에
--   그렇게 만들어진 요청이 그대로 INSERT 되었다.
--   실제 사고: 2026-09-04 놀터 19:00~21:00(김세헌) 과 19:00~20:00(한국희) 동시 확정.
--
-- 이 마이그레이션의 방어선은 두 겹이다.
--   1) EXCLUDE 제약  — DB가 겹치는 행을 원자적으로 거부한다. 경합(race)까지 막는 최종 방어선.
--   2) RPC 사전 검사 — 사용자에게 'SLOT_TAKEN' 이라는 뜻이 통하는 실패를 돌려주기 위한 것.
--      select-then-insert 는 READ COMMITTED 에서 팬텀 INSERT 를 막지 못하므로 이것만으로는
--      부족하고, 뚫린 경우는 1)이 잡아 exclusion_violation → SLOT_TAKEN 으로 변환한다.
--
-- 작성일: 2026-08-30

BEGIN;

-- =====================================================
-- 1. 선행 조건 검증
--    제약을 걸기 전에, 제약을 만들 수 없게 만드는 데이터가 있는지 먼저 확인해 실패시킨다.
--    (ALTER TABLE 이 뱉는 메시지는 원인을 알려주지 않아 운영 중 대응이 어렵다)
-- =====================================================
DO $$
DECLARE
  v_bad    INTEGER;
  v_dupes  INTEGER;
  v_sample TEXT;
BEGIN
  -- 1-a. end_time < start_time 인 행이 있으면 tsrange() 가 예외를 던진다.
  --      (정렬되지 않은 times 입력으로 만들어지던 과거의 깨진 행. 지금은 bookings.ts 가 정렬한다)
  SELECT COUNT(*) INTO v_bad FROM bookings WHERE end_time < start_time;
  IF v_bad > 0 THEN
    RAISE EXCEPTION
      'end_time < start_time 인 예약이 %건 있습니다. 먼저 바로잡아야 제약을 걸 수 있습니다: '
      'SELECT id, booking_date, space, start_time, end_time, name FROM bookings WHERE end_time < start_time;',
      v_bad;
  END IF;

  -- 1-b. 이미 겹쳐 있는 행이 남아 있으면 EXCLUDE 제약 생성 자체가 실패한다.
  --      어느 쪽을 취소할지는 운영 판단이므로 여기서 자동으로 정리하지 않는다.
  SELECT COUNT(*), string_agg(DISTINCT format('%s %s %s', a.booking_date, a.space, a.start_time), ', ')
    INTO v_dupes, v_sample
  FROM bookings a
  JOIN bookings b
    ON a.id < b.id
   AND a.space = b.space
   AND a.booking_date = b.booking_date
   AND a.start_time < b.end_time
   AND b.start_time < a.end_time
  WHERE a.status IS DISTINCT FROM 'cancelled' AND b.status IS DISTINCT FROM 'cancelled';

  IF v_dupes > 0 THEN
    RAISE EXCEPTION
      '겹치는 예약이 %건 남아 있습니다 (%). 한쪽을 status=''cancelled'' 로 정리한 뒤 다시 실행하세요.',
      v_dupes, v_sample;
  END IF;
END $$;

-- =====================================================
-- 2. EXCLUDE 제약 (하드 가드)
--    btree_gist 가 있어야 gist 인덱스에서 space 를 '=' 로 쓸 수 있다.
--
--    시간 범위는 tsrange(booking_date + start_time, booking_date + end_time) 로 만든다.
--    TIME 전용 range 타입은 기본 제공되지 않고, 날짜와 합쳐 두면 booking_date 비교가
--    범위 안에 함께 들어가 조건을 하나로 줄일 수 있다.
--
--    경계는 [start, end) 반개구간이라 19:00~20:00 과 20:00~21:00 은 겹치지 않는다.
--    start_time = end_time 인 행은 빈 범위가 되어 아무것과도 겹치지 않는다 —
--    제약 생성을 방해하지 않지만 보호도 받지 못하므로, 그런 행은 애초에 만들지 않아야 한다.
-- =====================================================
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_no_overlap;
ALTER TABLE bookings ADD CONSTRAINT bookings_no_overlap
  EXCLUDE USING gist (
    space WITH =,
    tsrange(booking_date + start_time, booking_date + end_time) WITH &&
  )
  -- status 에 NOT NULL 이 없다. '<>' 는 NULL 에서 NULL 이 되어 그 행을 부분 인덱스에서
  -- 통째로 빼 버리므로, NULL 상태의 예약이 보호를 못 받는다. IS DISTINCT FROM 은 NULL 을
  -- '취소가 아님'으로 보아 인덱스에 포함시킨다.
  WHERE (status IS DISTINCT FROM 'cancelled');

COMMENT ON CONSTRAINT bookings_no_overlap ON bookings IS
  '같은 공간에서 시간이 겹치는 예약을 금지한다 (취소된 예약은 제외). '
  '경계는 [start, end) 반개구간이라 연속 예약(19-20시 / 20-21시)은 허용된다.';

COMMIT;

-- =====================================================
-- 3. 예약 생성 RPC 갱신 (031 기반)
--    추가된 것은 슬롯 점유 검사 하나뿐이다. 031 의 나머지 동작은 그대로 유지한다.
--      a) INSERT 전에 겹침을 확인해 SLOT_TAKEN 을 반환 (사용자에게 보여줄 안내 문구용)
--      b) 그 사이를 뚫고 들어온 동시 INSERT 는 EXCLUDE 제약이 잡고,
--         exclusion_violation 을 같은 SLOT_TAKEN 으로 변환한다
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
    -- bookings_no_overlap 제약과 같은 술어여야 한다. 여기서 놓친 행을 제약이 잡으면
    -- 사용자는 슬롯 목록이 빠진 밋밋한 메시지를 받게 된다.
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
  -- 방음실 세대원 무료는 한도가 없어 freeHoursUsed=0으로 들어오므로 이 블록을 타지 않는다.
  IF v_space = 'nolter' AND v_household IS NOT NULL AND v_free > 0
     AND v_date >= DATE '2026-08-01' THEN
    v_month_start := date_trunc('month', v_date)::DATE;

    -- 같은 세대·같은 달의 동시 예약을 직렬화한다 (트랜잭션 스코프, COMMIT/ROLLBACK 시 자동 해제).
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
    pii_consent_given, pii_consent_at
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
    CASE WHEN v_consent THEN NOW() ELSE NULL END
  )
  RETURNING id INTO v_booking_id;

  -- ---- 4. 선불권 차감 ----
  IF p_deduction_plan IS NOT NULL AND jsonb_array_length(p_deduction_plan) > 0 THEN
    FOR v_plan IN SELECT * FROM jsonb_array_elements(p_deduction_plan)
    LOOP
      v_purchase_id := (v_plan->>'purchaseId')::UUID;
      v_to_deduct   := (v_plan->>'hoursToDeduct')::NUMERIC;

      -- 현재 잔여 시간 확인 + 행 잠금 (동시성 방지)
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

-- 0-1 의 검사를 통과한 뒤 동시 INSERT 에 밀린 경우. 위와 같은 코드로 돌려주어
-- 호출측이 경합인지 아닌지 구분하지 않아도 되게 한다.
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
  '중복은 SLOT_TAKEN, 무료시간 초과는 FREE_HOURS_EXCEEDED 로 반환한다.';

COMMIT;
