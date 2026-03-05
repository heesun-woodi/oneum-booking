-- 예약 테이블
CREATE TABLE bookings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 예약 정보
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  space VARCHAR(20) NOT NULL CHECK (space IN ('nolter', 'soundroom')),
  
  -- 예약자 정보
  member_type VARCHAR(20) NOT NULL CHECK (member_type IN ('member', 'non-member')),
  household VARCHAR(10),  -- 회원: 201, 301, etc.
  name VARCHAR(100) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  
  -- 결제 정보
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'cancelled')),
  amount INTEGER DEFAULT 0,
  paid_at TIMESTAMP,
  
  -- 메타 정보
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 인덱스 (성능 최적화)
CREATE INDEX idx_bookings_date_space ON bookings(booking_date, space);
CREATE INDEX idx_bookings_phone ON bookings(phone);
CREATE INDEX idx_bookings_household ON bookings(household) WHERE household IS NOT NULL;

-- RLS (Row Level Security) 정책
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

-- 모든 사람이 예약 조회 가능 (공개 캘린더)
CREATE POLICY "Anyone can view bookings" ON bookings
  FOR SELECT USING (true);

-- 인증된 사용자만 예약 생성 가능 (일단 모두 허용, 나중에 강화)
CREATE POLICY "Anyone can create bookings" ON bookings
  FOR INSERT WITH CHECK (true);

-- 본인 예약만 수정/삭제 가능
CREATE POLICY "Users can update their own bookings" ON bookings
  FOR UPDATE USING (phone = current_setting('request.jwt.claims', true)::json->>'phone');

CREATE POLICY "Users can delete their own bookings" ON bookings
  FOR DELETE USING (phone = current_setting('request.jwt.claims', true)::json->>'phone');
