-- ===== Phase 4: 알림톡 시스템 DB 스키마 =====
-- 작성일: 2026-03-15
-- 작성자: Buzz (AI Assistant)

-- ===== 1. bookings 테이블 수정 =====

-- 결제 관련 컬럼 추가
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed'));

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_member_type ON bookings(member_type);
CREATE INDEX IF NOT EXISTS idx_bookings_status_date ON bookings(status, booking_date);

-- ===== 2. notification_logs 테이블 생성 =====

CREATE TABLE IF NOT EXISTS notification_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 발송 대상
  message_type VARCHAR(10) NOT NULL,  -- '1-2', '2-1', etc.
  recipient_phone VARCHAR(20) NOT NULL,
  recipient_name VARCHAR(100),
  
  -- 연관 데이터
  booking_id UUID REFERENCES bookings(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  -- 발송 결과
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  aligo_msg_id VARCHAR(50),           -- Aligo 응답 ID
  error_message TEXT,
  
  -- 메타
  scheduled_at TIMESTAMP WITH TIME ZONE,  -- 예약 발송 시간
  sent_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_notification_logs_type ON notification_logs(message_type);
CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
CREATE INDEX IF NOT EXISTS idx_notification_logs_scheduled ON notification_logs(scheduled_at) 
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notification_logs_booking ON notification_logs(booking_id);

-- RLS
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage notification_logs" ON notification_logs 
  FOR ALL USING (true);

-- ===== 3. cron_job_logs 테이블 생성 =====

CREATE TABLE IF NOT EXISTS cron_job_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  job_name VARCHAR(50) NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE,
  status VARCHAR(20) DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  records_processed INTEGER DEFAULT 0,
  error_message TEXT,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_cron_job_logs_name ON cron_job_logs(job_name);
CREATE INDEX IF NOT EXISTS idx_cron_job_logs_started ON cron_job_logs(started_at DESC);

-- RLS
ALTER TABLE cron_job_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage cron_job_logs" ON cron_job_logs 
  FOR ALL USING (true);

-- ===== 4. 이용 횟수 추적 뷰 생성 =====

-- 월별 이용 횟수 (취소되지 않은 예약만)
CREATE OR REPLACE VIEW monthly_usage AS
SELECT 
  household,
  space,
  DATE_TRUNC('month', booking_date) AS month,
  COUNT(*) AS usage_count
FROM bookings
WHERE 
  member_type = 'member'
  AND status NOT IN ('cancelled')
  AND household IS NOT NULL
GROUP BY household, space, DATE_TRUNC('month', booking_date);

-- 당일 취소 카운트 (차감 대상)
CREATE OR REPLACE VIEW cancelled_same_day AS
SELECT 
  household,
  space,
  DATE_TRUNC('month', booking_date) AS month,
  COUNT(*) AS cancelled_count
FROM bookings
WHERE 
  member_type = 'member'
  AND status = 'cancelled'
  AND household IS NOT NULL
  AND DATE(cancelled_at) = booking_date  -- 당일 취소
GROUP BY household, space, DATE_TRUNC('month', booking_date);

-- ===== 완료 메시지 =====
SELECT 'Phase 4 알림톡 시스템 스키마 생성 완료!' as message;
