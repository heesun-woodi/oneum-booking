-- Phase 6.5 FIX: user_id NULL 문제 해결
-- 작성일: 2026-04-03
-- 근본 원인: INSERT 문에 user_id 컬럼 누락

-- =====================================================
-- create_booking_with_prepaid RPC 함수 재배포
-- =====================================================

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
  
  -- ⭐ 5. 예약 생성 (user_id 추가!)
  INSERT INTO bookings (
    user_id,
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
    p_user_id,
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
GRANT EXECUTE ON FUNCTION create_booking_with_prepaid TO anon;

-- =====================================================
-- 완료
-- =====================================================
SELECT '✅ user_id 누락 문제 해결 완료!' AS message;
