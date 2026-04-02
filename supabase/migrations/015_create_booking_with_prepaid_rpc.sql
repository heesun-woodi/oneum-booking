-- Phase 6.5: 선불권 연동 RPC 함수
-- 작성일: 2026-04-03
-- 설명: 예약 생성 시 선불권을 자동으로 차감하는 RPC 함수

-- =====================================================
-- create_booking_with_prepaid RPC 함수
-- =====================================================
-- 예약 생성 시 선불권을 우선 사용하고, 부족하면 혼합 결제 처리
-- 
-- 파라미터:
--   p_user_id: 사용자 ID (UUID)
--   p_booking_date: 예약 날짜 (YYYY-MM-DD)
--   p_start_time: 시작 시간 (HH:MM)
--   p_end_time: 종료 시간 (HH:MM)
--   p_space: 공간 ('nolter' | 'soundroom')
--   p_member_type: 회원 유형 ('member' | 'non-member')
--   p_household: 세대 번호 (nullable)
--   p_name: 예약자 이름
--   p_phone: 전화번호
--   p_requested_hours: 요청 시간 수 (integer)
-- 
-- 반환값:
--   booking_id: 생성된 예약 ID
--   prepaid_hours_used: 사용된 선불권 시간
--   regular_hours: 일반 결제 시간
--   amount: 결제 금액
--   status: 예약 상태 ('confirmed' | 'pending')
--   payment_status: 결제 상태 ('completed' | 'pending' | 'prepaid')

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
  status TEXT,
  payment_status TEXT
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
BEGIN
  -- 1. 회원인 경우 무료 시간 처리 (선불권 사용 불필요)
  IF p_member_type = 'member' THEN
    v_status := 'confirmed';
    v_payment_status := 'completed';
    v_regular_hours := p_requested_hours;
    v_amount := 0;
  ELSE
    -- 2. 사용 가능한 선불권 조회 (유효기간 임박 순, 잔여 시간 적은 순)
    v_remaining_hours := p_requested_hours;
    
    FOR v_purchase_record IN 
      SELECT id, remaining_hours
      FROM prepaid_purchases
      WHERE user_id = p_user_id
        AND status = 'paid'
        AND expires_at > NOW()
        AND remaining_hours > 0
      ORDER BY expires_at ASC, remaining_hours ASC
    LOOP
      -- 차감할 시간 계산
      v_hours_to_deduct := LEAST(v_purchase_record.remaining_hours, v_remaining_hours);
      
      -- 선불권 차감
      UPDATE prepaid_purchases
      SET remaining_hours = remaining_hours - v_hours_to_deduct,
          updated_at = NOW()
      WHERE id = v_purchase_record.id;
      
      -- 누적
      v_prepaid_hours_used := v_prepaid_hours_used + v_hours_to_deduct;
      v_remaining_hours := v_remaining_hours - v_hours_to_deduct;
      
      -- 모두 충당되면 종료
      EXIT WHEN v_remaining_hours = 0;
    END LOOP;
    
    -- 3. 남은 시간은 일반 결제
    v_regular_hours := v_remaining_hours;
    v_amount := v_regular_hours * 14000;
    
    -- 4. 상태 결정
    IF v_prepaid_hours_used = p_requested_hours THEN
      -- 전체 선불권 사용
      v_status := 'confirmed';
      v_payment_status := 'prepaid';
    ELSIF v_prepaid_hours_used > 0 THEN
      -- 혼합 (선불권 + 일반)
      v_status := 'pending';
      v_payment_status := 'pending';
    ELSE
      -- 전체 일반 결제
      v_status := 'pending';
      v_payment_status := 'pending';
    END IF;
  END IF;
  
  -- 5. 예약 생성
  INSERT INTO bookings (
    booking_date,
    start_time,
    end_time,
    space,
    member_type,
    household,
    name,
    phone,
    amount,
    status,
    payment_status,
    prepaid_hours_used,
    regular_hours
  ) VALUES (
    p_booking_date,
    p_start_time,
    p_end_time,
    p_space,
    p_member_type,
    p_household,
    p_name,
    p_phone,
    v_amount,
    v_status,
    v_payment_status,
    v_prepaid_hours_used,
    v_regular_hours
  )
  RETURNING id INTO v_booking_id;
  
  -- 6. 선불권 사용 내역 기록
  IF v_prepaid_hours_used > 0 THEN
    FOR v_purchase_record IN 
      SELECT id, remaining_hours
      FROM prepaid_purchases
      WHERE user_id = p_user_id
        AND status = 'paid'
        AND expires_at > NOW()
      ORDER BY expires_at ASC, remaining_hours ASC
    LOOP
      -- 사용 내역 기록 (각 선불권별로)
      INSERT INTO prepaid_usages (
        purchase_id,
        booking_id,
        hours_used
      ) VALUES (
        v_purchase_record.id,
        v_booking_id,
        LEAST(v_purchase_record.remaining_hours, p_requested_hours)
      );
    END LOOP;
  END IF;
  
  -- 7. 결과 반환
  RETURN QUERY SELECT 
    v_booking_id,
    v_prepaid_hours_used,
    v_regular_hours,
    v_amount,
    v_status,
    v_payment_status;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 권한 부여
-- =====================================================
GRANT EXECUTE ON FUNCTION create_booking_with_prepaid TO authenticated;

-- =====================================================
-- 완료
-- =====================================================
COMMENT ON FUNCTION create_booking_with_prepaid IS '선불권 자동 차감 예약 생성 함수';
