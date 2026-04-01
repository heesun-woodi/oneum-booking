-- 메시지 템플릿에 trigger (발송 시점) 정보 추가
-- 작성일: 2026-04-01

ALTER TABLE message_templates 
  ADD COLUMN IF NOT EXISTS trigger_info VARCHAR(100);

COMMENT ON COLUMN message_templates.trigger_info IS '발송 시점 (예: 회원가입 승인 시, 예약 완료 직후)';

-- 기존 데이터에 trigger 정보 업데이트
UPDATE message_templates SET trigger_info = '관리자가 가입 승인 시' WHERE type_code = '1-2';
UPDATE message_templates SET trigger_info = '관리자가 가입 거부 시' WHERE type_code = '1-3';

UPDATE message_templates SET trigger_info = '회원 예약 완료 직후' WHERE type_code = '2-1';
UPDATE message_templates SET trigger_info = '비회원 예약 완료 직후' WHERE type_code = '2-2';
UPDATE message_templates SET trigger_info = '예약 취소 직후' WHERE type_code = '2-3';

UPDATE message_templates SET trigger_info = '관리자가 입금 확인 시' WHERE type_code = '3-1';
UPDATE message_templates SET trigger_info = '입금 기한 전날 20:00' WHERE type_code = '3-2';

UPDATE message_templates SET trigger_info = '예약 전날 20:00' WHERE type_code = '4-1';
UPDATE message_templates SET trigger_info = '예약 당일 10:00' WHERE type_code = '4-2';
UPDATE message_templates SET trigger_info = '예약 전날 20:00' WHERE type_code = '4-3';

UPDATE message_templates SET trigger_info = '매일 오전 9:00 (관리자용)' WHERE type_code = '5-2';
UPDATE message_templates SET trigger_info = '예약 취소 시 (관리자용)' WHERE type_code = '5-3';

UPDATE message_templates SET trigger_info = '신규 회원가입 신청 시' WHERE type_code = '6-1';

-- 완료 메시지
SELECT 'Trigger 컬럼 추가 완료!' as message;
