-- Migration 022: prepaid_purchases status에 'cancelled' 추가
-- 48시간 미입금 자동 취소 시 사용

ALTER TABLE prepaid_purchases
  DROP CONSTRAINT IF EXISTS prepaid_purchases_status_check;

ALTER TABLE prepaid_purchases
  ADD CONSTRAINT prepaid_purchases_status_check
  CHECK (status IN ('pending', 'paid', 'refund_requested', 'refunded', 'cancelled'));
