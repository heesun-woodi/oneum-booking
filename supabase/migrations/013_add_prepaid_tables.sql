-- Phase 6.2: 선불권 시스템 DB 스키마
-- 작성일: 2026-04-02

-- =====================================================
-- 1. 선불권 상품 테이블
-- =====================================================
CREATE TABLE prepaid_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 상품 정보
  name VARCHAR(100) NOT NULL,
  description TEXT,
  
  -- 가격 및 구성
  price INTEGER NOT NULL,                   -- 100000 (판매가)
  regular_price INTEGER NOT NULL,           -- 140000 (정상가)
  hours INTEGER NOT NULL,                   -- 10 (총 시간)
  
  -- 유효기간
  validity_months INTEGER NOT NULL DEFAULT 6,
  
  -- 상태
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  
  -- 메타
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 2. 선불권 구매 내역 테이블
-- =====================================================
CREATE TABLE prepaid_purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 구매자
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES prepaid_products(id) ON DELETE RESTRICT,
  
  -- 구매 정보
  total_hours INTEGER NOT NULL,             -- 구매한 총 시간
  remaining_hours INTEGER NOT NULL,         -- 남은 시간
  
  -- 유효기간
  purchased_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  paid_at TIMESTAMP WITH TIME ZONE,         -- 입금 확인 시점
  expires_at TIMESTAMP WITH TIME ZONE,      -- 유효 종료일 (paid_at + validity_months)
  
  -- 상태
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'refunded')),
  -- pending: 입금 대기
  -- paid: 사용 가능
  -- refunded: 환불됨
  
  -- 환불
  refund_amount INTEGER,
  refunded_at TIMESTAMP WITH TIME ZONE,
  
  -- 메타
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 3. 선불권 사용 내역 테이블
-- =====================================================
CREATE TABLE prepaid_usages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 연관
  purchase_id UUID NOT NULL REFERENCES prepaid_purchases(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  
  -- 사용 정보
  hours_used INTEGER NOT NULL DEFAULT 1,
  
  -- 메타
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- 4. bookings 테이블 컬럼 추가
-- =====================================================
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS prepaid_hours_used INTEGER DEFAULT 0;

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS regular_hours INTEGER DEFAULT 0;

-- =====================================================
-- 5. 인덱스 생성
-- =====================================================
CREATE INDEX idx_prepaid_purchases_user ON prepaid_purchases(user_id);
CREATE INDEX idx_prepaid_purchases_status ON prepaid_purchases(status);
CREATE INDEX idx_prepaid_purchases_expires_at ON prepaid_purchases(expires_at) 
  WHERE status = 'paid';

CREATE INDEX idx_prepaid_usages_purchase ON prepaid_usages(purchase_id);
CREATE INDEX idx_prepaid_usages_booking ON prepaid_usages(booking_id);

-- =====================================================
-- 6. RLS (Row Level Security) 정책
-- =====================================================
ALTER TABLE prepaid_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepaid_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepaid_usages ENABLE ROW LEVEL SECURITY;

-- prepaid_products: 누구나 조회 가능
CREATE POLICY "Anyone can view active products" ON prepaid_products
  FOR SELECT USING (is_active = true);

-- prepaid_purchases: 본인 구매 내역만 조회
CREATE POLICY "Users can view own purchases" ON prepaid_purchases
  FOR SELECT USING (auth.uid() = user_id);

-- prepaid_usages: 본인 사용 내역만 조회
CREATE POLICY "Users can view own usages" ON prepaid_usages
  FOR SELECT USING (
    purchase_id IN (
      SELECT id FROM prepaid_purchases WHERE user_id = auth.uid()
    )
  );

-- =====================================================
-- 7. 초기 데이터: 10회 선불권 상품
-- =====================================================
INSERT INTO prepaid_products (
  name, 
  description, 
  price, 
  regular_price, 
  hours, 
  validity_months,
  is_active
) VALUES (
  '10회 선불권',
  '1시간 예약 × 10회 (정가 140,000원 → 100,000원, 약 29% 할인)',
  100000,
  140000,
  10,
  6,
  true
);

-- =====================================================
-- 8. updated_at 자동 업데이트 트리거
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prepaid_products_updated_at
  BEFORE UPDATE ON prepaid_products
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prepaid_purchases_updated_at
  BEFORE UPDATE ON prepaid_purchases
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 완료
-- =====================================================
COMMENT ON TABLE prepaid_products IS '선불권 상품 목록';
COMMENT ON TABLE prepaid_purchases IS '선불권 구매 내역';
COMMENT ON TABLE prepaid_usages IS '선불권 사용 내역';
