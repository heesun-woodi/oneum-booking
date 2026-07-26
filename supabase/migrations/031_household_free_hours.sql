-- Phase 8: 온음 세대 회원 예약 정책 변경 (건수 → 시간 기준)
--
--   놀터   : 세대(household)당 월 20시간 무료
--            한도 초과분은 선불권 우선 차감 → 나머지 14,000원/시간
--            한 예약 안에서 무료/선불권/현금 분할 과금 가능
--   방음실 : 세대원 무제한 무료 (기존 유지, 무료 한도를 소진하지 않는다)
--
-- 기존 정책(023): 놀터 월 3회 무료, 초과 시 10,000원/건 (payment_method='nolter_paid')
-- → 'nolter_paid'는 신규 발급하지 않지만 기존 데이터 보존을 위해 CHECK 값은 남긴다.
--
-- 작성일: 2026-07-26

BEGIN;

-- =====================================================
-- 0. 실행 전 눈으로 확인할 점검 쿼리
-- =====================================================
-- SELECT id, name, household FROM users WHERE is_resident = true AND btrim(coalesce(household,'')) = '';
-- SELECT payment_method, count(*), sum(amount) FROM bookings GROUP BY 1 ORDER BY 1;

-- =====================================================
-- 1. 무료 소진 시간 컬럼
--    예약 1건이 무료+선불권+현금으로 쪼개질 수 있으므로,
--    무료로 처리된 시간을 별도로 기록해야 세대별 월 소진량을 집계할 수 있다.
-- =====================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS free_hours_used NUMERIC(10,1) NOT NULL DEFAULT 0;

COMMENT ON COLUMN bookings.free_hours_used IS
  '이 예약이 소진한 세대 무료 시간 (놀터 한정, 세대당 월 20시간). 방음실 세대원 무료는 한도가 없어 0으로 둔다.';

-- 세대/월 합계 조회 최적화 (RPC 가드 + UI 조회의 핫 패스)
CREATE INDEX IF NOT EXISTS idx_bookings_free_hours_lookup
  ON bookings (household, space, booking_date)
  WHERE household IS NOT NULL AND status <> 'cancelled';

-- =====================================================
-- 2. household 정규화 ('' → NULL)
--    구 직접-INSERT 경로는 ''를, RPC 경로는 NULLIF로 NULL을 저장해 왔다.
--    ''가 남아 있으면 '세대 없음' 예약들이 하나의 가상 세대로 뭉쳐 20시간을 공유한다.
-- =====================================================
UPDATE bookings SET household = NULL
  WHERE household IS NOT NULL AND btrim(household) = '';

UPDATE users SET household = NULL
  WHERE household IS NOT NULL AND btrim(household) = '';

-- =====================================================
-- 3. regular_hours 정규화 (슬롯 수 → 시간)
--    bookings.ts의 직접 INSERT 경로가 30분 슬롯 개수를 넣어 왔다.
--    선불권 RPC 경로만 시간 단위로 정확했다.
-- =====================================================

-- 3-a. 무료 / 구 놀터정액 예약: 시간당 과금된 시간이 없다
UPDATE bookings SET regular_hours = 0
  WHERE payment_method IN ('free', 'nolter_paid') AND regular_hours <> 0;

-- 3-b. 'regular' 예약 중 값이 정확히 슬롯 수인 행만 시간으로 환산
--      (duration_hours = slot_count 인 경우는 duration = 0 뿐이라 오탐이 없다)
UPDATE bookings SET
  regular_hours = ROUND((EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)::numeric, 1)
WHERE payment_method = 'regular'
  AND COALESCE(prepaid_hours_used, 0) = 0
  AND regular_hours = ROUND((EXTRACT(EPOCH FROM (end_time - start_time)) / 1800.0)::numeric, 1);

-- =====================================================
-- 4. free_hours_used 백필 (즉시 시행 — 이번 달 기존 예약도 시간으로 합산)
-- =====================================================

-- 4-a. 무료로 처리됐던 예약 → 실제 이용 시간만큼 무료 소진으로 간주
UPDATE bookings SET
  free_hours_used = ROUND((EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0)::numeric, 1)
WHERE payment_method = 'free'
  AND household IS NOT NULL
  AND status <> 'cancelled';

-- 4-b. 구 'nolter_paid'(10,000원/건)는 이미 현금 결제된 건이므로 새 20시간 풀을 소진하지 않는다
UPDATE bookings SET free_hours_used = 0 WHERE payment_method = 'nolter_paid';

-- 4-c. 검증(수동): 이번 달 이미 20시간을 넘긴 세대가 있는지 확인
-- SELECT household, SUM(free_hours_used) AS used FROM bookings
-- WHERE space='nolter' AND status <> 'cancelled' AND household IS NOT NULL
--   AND booking_date >= date_trunc('month', CURRENT_DATE)::date
--   AND booking_date <  (date_trunc('month', CURRENT_DATE) + interval '1 month')::date
-- GROUP BY 1 HAVING SUM(free_hours_used) > 20;

-- =====================================================
-- 5. payment_method 의미 정리
--    'nolter_paid'는 과거 데이터 보존용으로만 남긴다.
-- =====================================================
ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_method_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_method_check
  CHECK (payment_method IN ('free', 'regular', 'prepaid', 'mixed', 'nolter_paid'));

COMMENT ON COLUMN bookings.payment_method IS
  '금전 차원만 표현한다: free(무상) / prepaid(선불권 전액) / mixed(선불권+현금) / regular(현금 전액). '
  'nolter_paid는 2026-07 이전 놀터 10,000원/건 정책의 레거시 값(신규 발급 없음). '
  '무료 시간 소진 여부는 free_hours_used로 판단할 것.';

-- =====================================================
-- 6. 세대 월간 무료 사용량 조회 함수
--    UI 배지와 RPC 가드가 같은 SQL을 읽도록 해 계산이 어긋나지 않게 한다.
-- =====================================================
CREATE OR REPLACE FUNCTION get_household_free_hours(
  p_household TEXT,
  p_month     DATE
)
RETURNS NUMERIC
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(SUM(free_hours_used), 0)::NUMERIC
  FROM bookings
  WHERE household = NULLIF(btrim(p_household), '')
    AND space = 'nolter'
    AND status <> 'cancelled'
    AND booking_date >= date_trunc('month', p_month)::DATE
    AND booking_date <  (date_trunc('month', p_month) + INTERVAL '1 month')::DATE;
$$;

GRANT EXECUTE ON FUNCTION get_household_free_hours(TEXT, DATE) TO anon, authenticated;

COMMENT ON FUNCTION get_household_free_hours(TEXT, DATE) IS
  '세대의 해당 월 놀터 무료 사용 시간 합계. 취소된 예약은 제외되므로 취소 시 무료 시간이 자동 반환된다.';

-- =====================================================
-- 7. 예약 생성 RPC 재작성 (029 기반)
--    a) freeHoursUsed / piiConsentGiven 저장
--    b) status·payment_status를 payment_method가 아니라 amount > 0으로 판정
--    c) 놀터 무료 한도 서버측 검증 (advisory lock으로 동시성 안전)
--    d) 029에서 유실된 SECURITY DEFINER + GRANT 복구, search_path 고정
-- =====================================================
DROP FUNCTION IF EXISTS create_booking_with_prepaid(JSONB, JSONB) CASCADE;

CREATE FUNCTION create_booking_with_prepaid(
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
  v_free      NUMERIC(10,1) := COALESCE((p_booking_data->>'freeHoursUsed')::NUMERIC, 0);
  v_prepaid   NUMERIC(10,1) := COALESCE((p_booking_data->>'prepaidHoursUsed')::NUMERIC, 0);
  v_regular   NUMERIC(10,1) := COALESCE((p_booking_data->>'regularHours')::NUMERIC, 0);
  v_amount    INTEGER       := COALESCE((p_booking_data->>'amount')::INTEGER, 0);
  v_limit     NUMERIC(10,1) := COALESCE((p_booking_data->>'freeHoursLimit')::NUMERIC, 20);
  v_consent   BOOLEAN       := COALESCE((p_booking_data->>'piiConsentGiven')::BOOLEAN, false);

  v_month_start DATE;
  v_used        NUMERIC(10,1);
  v_status      TEXT;
  v_pay_status  TEXT;
BEGIN
  -- ---- 0. 놀터 무료 한도 검증 ----
  -- 방음실 세대원 무료는 한도가 없어 freeHoursUsed=0으로 들어오므로 이 블록을 타지 않는다.
  IF v_space = 'nolter' AND v_household IS NOT NULL AND v_free > 0 THEN
    v_month_start := date_trunc('month', v_date)::DATE;

    -- 같은 세대·같은 달의 동시 예약을 직렬화한다.
    -- READ COMMITTED에서는 SUM만으로 팬텀 INSERT(동시에 둘 다 '아직 여유 있음'으로 읽는 경우)를
    -- 막을 수 없고, 잠글 기존 행(households 테이블)도 없으므로 advisory lock을 쓴다.
    -- 트랜잭션 스코프라 COMMIT/ROLLBACK 시 자동 해제된다.
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
      -- RAISE 대신 구조화된 실패를 반환한다.
      -- 호출측(createBooking)이 code를 보고 무료 시간을 재계산해 1회 재시도한다.
      RETURN jsonb_build_object(
        'success',        false,
        'code',           'FREE_HOURS_EXCEEDED',
        'error',          format('무료 시간 한도 초과 (사용 %s / 한도 %s, 요청 %s)', v_used, v_limit, v_free),
        'freeHoursUsed',  v_used,
        'freeHoursLimit', v_limit
      );
    END IF;
  END IF;

  -- ---- 1. 상태 판정: 받을 돈이 남아 있으면 미입금(pending) ----
  IF v_amount > 0 THEN
    v_status := 'pending';   v_pay_status := 'pending';
  ELSE
    v_status := 'confirmed'; v_pay_status := 'completed';
  END IF;

  -- ---- 2. 예약 생성 ----
  INSERT INTO bookings (
    booking_date, start_time, end_time, space,
    member_type, household, name, phone, user_id,
    free_hours_used, prepaid_hours_used, regular_hours,
    payment_method, amount, status, payment_status,
    pii_consent_given, pii_consent_at
  )
  VALUES (
    v_date,
    (p_booking_data->>'startTime')::TIME,
    (p_booking_data->>'endTime')::TIME,
    v_space,
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

  -- ---- 3. 선불권 차감 ----
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

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'code', 'EXCEPTION', 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION create_booking_with_prepaid(JSONB, JSONB) TO anon, authenticated;

COMMENT ON FUNCTION create_booking_with_prepaid(JSONB, JSONB) IS
  '예약 생성 + 세대 무료시간 한도 검증 + 선불권 차감 (단일 트랜잭션). status/payment_status는 amount > 0으로 판정한다.';

-- =====================================================
-- 8. monthly_usage 뷰에 시간 집계 추가
--    (CREATE OR REPLACE VIEW는 기존 컬럼 뒤에 추가하는 것만 허용한다)
-- =====================================================
CREATE OR REPLACE VIEW monthly_usage AS
SELECT
  household,
  space,
  DATE_TRUNC('month', booking_date) AS month,
  COUNT(*)                          AS usage_count,
  COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0), 0)::NUMERIC(10,1) AS booked_hours,
  COALESCE(SUM(free_hours_used), 0)::NUMERIC(10,1)                                      AS free_hours
FROM bookings
WHERE member_type = 'member'
  AND status NOT IN ('cancelled')
  AND household IS NOT NULL
GROUP BY household, space, DATE_TRUNC('month', booking_date);

-- =====================================================
-- 9. 안내 문구 갱신
--    site_settings.value는 TEXT에 담긴 JSON이므로 jsonb_set으로 정확히 갱신한다.
--    (023은 spaces_info만 문자열 REPLACE로 패치해 general_rules에 '월 8시간'이 남아 있었다)
-- =====================================================
UPDATE site_settings SET
  value = jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(value::jsonb,
                  '{nolter,pricing,member}',       '"세대원 무료 (세대당 월 20시간) / 초과 시 14,000원/시간"'::jsonb),
                  '{nolter,pricing,nonMember}',    '"14,000원/시간"'::jsonb),
                  '{soundroom,pricing,member}',    '"세대원 무료 (무제한)"'::jsonb),
                  '{soundroom,pricing,nonMember}', '"14,000원/시간"'::jsonb
          )::text,
  updated_at = NOW()
WHERE key = 'spaces_info';

UPDATE site_settings SET
  value = jsonb_set(value::jsonb, '{booking}', '[
    "예약은 1일 전까지 가능합니다 (당일 예약 불가)",
    "온음 세대는 놀터를 세대당 월 20시간까지 무료 이용 (방음실은 무제한 무료)",
    "무료 시간 초과분은 보유 선불권에서 먼저 차감되고, 남은 시간만 14,000원/시간으로 청구됩니다",
    "일반 회원·비회원은 14,000원/시간 (선불권 사용 가능)"
  ]'::jsonb)::text,
  updated_at = NOW()
WHERE key = 'general_rules';

-- usage_rules는 마크다운 텍스트라 문자열 치환으로 갱신한다.
UPDATE site_settings SET
  value = REPLACE(
            REPLACE(value,
              '- 회원은 월 8시간까지 무료 이용',
              '- 온음 세대는 놀터를 세대당 월 20시간까지 무료 이용 (방음실은 무제한 무료)'),
            '- 초과 시간은 14,000원/시간',
            '- 무료 시간 초과분은 선불권 우선 차감 후 14,000원/시간'),
  updated_at = NOW()
WHERE key = 'usage_rules';

COMMIT;
