-- Phase 6.5: 예약-선불권 연동 컬럼 추가
-- 작성일: 2026-04-03

-- =====================================================
-- 1. payment_method 컬럼 추가
-- =====================================================
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'regular';

-- 기존 데이터 마이그레이션
UPDATE bookings 
SET payment_method = CASE 
  WHEN member_type = 'member' AND amount = 0 THEN 'free'
  WHEN member_type = 'non-member' THEN 'regular'
  ELSE 'regular'
END
WHERE payment_method = 'regular';

-- CHECK 제약 추가 (이미 있으면 스킵)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bookings_payment_method_check'
  ) THEN
    ALTER TABLE bookings 
      ADD CONSTRAINT bookings_payment_method_check 
      CHECK (payment_method IN ('free', 'regular', 'prepaid', 'mixed'));
  END IF;
END $$;

-- =====================================================
-- 2. user_id 컬럼 추가 (로그인 사용자 연결)
-- =====================================================
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id);

-- =====================================================
-- 3. payment_status 컬럼 추가
-- =====================================================
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending';

-- CHECK 제약 추가
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'bookings_payment_status_check'
  ) THEN
    ALTER TABLE bookings 
      ADD CONSTRAINT bookings_payment_status_check 
      CHECK (payment_status IN ('pending', 'completed', 'refunded'));
  END IF;
END $$;

-- 기존 데이터 마이그레이션
UPDATE bookings 
SET payment_status = CASE 
  WHEN status IN ('confirmed', 'paid') THEN 'completed'
  WHEN status = 'cancelled' THEN 'refunded'
  ELSE 'pending'
END
WHERE payment_status = 'pending';

-- =====================================================
-- 4. cancelled_at 컬럼 추가 (취소 시점 기록)
-- =====================================================
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

-- =====================================================
-- 5. 인덱스 생성
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_method ON bookings(payment_method);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);

-- =====================================================
-- 완료
-- =====================================================
COMMENT ON COLUMN bookings.payment_method IS '결제 방식: free(세대회원무료), regular(일반결제), prepaid(선불권), mixed(혼합)';
COMMENT ON COLUMN bookings.user_id IS '로그인 사용자 ID (선불권 사용자 추적)';
COMMENT ON COLUMN bookings.payment_status IS '결제 상태: pending(대기), completed(완료), refunded(환불)';
COMMENT ON COLUMN bookings.cancelled_at IS '예약 취소 시점';
