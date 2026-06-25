-- Migration 030: Web Push 구독 저장 + 알림 발송 채널 구분
-- 작성일: 2026-06-24
-- 목적: PWA 설치 + 푸시 동의 사용자에게 문자 대신 Web Push 발송

-- =====================================================
-- 1. push_subscriptions 테이블
-- =====================================================
-- 한 사용자가 여러 기기(브라우저)에서 구독 가능 → user_id에 unique 미적용.
-- 브라우저 PushSubscription.endpoint가 전역 고유 키.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 구독자
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 브라우저 PushSubscription
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,            -- keys.p256dh
  auth TEXT NOT NULL,              -- keys.auth

  -- 메타 (기기 구분/디버깅용)
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

-- RLS: 서비스 롤 전용 접근 (구독 endpoint는 민감 정보).
-- 앱은 커스텀 인증(Supabase Auth 미사용)이므로 anon 정책을 두지 않고,
-- 모든 접근은 createServiceRoleClient()로만 수행한다(RLS 우회).
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE push_subscriptions IS 'Web Push 구독 정보 (서비스 롤 전용 접근)';

-- =====================================================
-- 2. notification_logs 채널 구분 컬럼
-- =====================================================
-- 발송 채널 추적: 'sms'(기존 기본값) 또는 'push'
ALTER TABLE notification_logs
  ADD COLUMN IF NOT EXISTS channel VARCHAR(10) NOT NULL DEFAULT 'sms'
    CHECK (channel IN ('sms', 'push'));

-- =====================================================
-- 완료
-- =====================================================
SELECT 'Migration 030: push_subscriptions 생성 + notification_logs.channel 추가 완료!' as message;
