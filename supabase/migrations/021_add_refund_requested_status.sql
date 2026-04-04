-- Migration 021: prepaid_purchases status에 'refund_requested' 추가
-- 사용자가 환불 신청 시 즉시 처리되지 않고 관리자 승인 대기 상태로 변경

-- 기존 CHECK 제약 제거 후 재생성
ALTER TABLE prepaid_purchases
  DROP CONSTRAINT IF EXISTS prepaid_purchases_status_check;

ALTER TABLE prepaid_purchases
  ADD CONSTRAINT prepaid_purchases_status_check
  CHECK (status IN ('pending', 'paid', 'refund_requested', 'refunded'));
