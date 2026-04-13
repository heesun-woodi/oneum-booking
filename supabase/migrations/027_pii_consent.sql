-- Migration 019: PII consent fields
-- 개인정보 수집·이용 동의 필드 추가 (개인정보보호법 제15조)

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pii_consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pii_consent_at TIMESTAMPTZ;

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS pii_consent_given BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pii_consent_at TIMESTAMPTZ;
