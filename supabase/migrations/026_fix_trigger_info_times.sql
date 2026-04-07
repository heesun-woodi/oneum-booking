-- trigger_info 발송 시간 수정
-- vercel.json 크론 실제 KST 시간 기준으로 정정

-- 4-1: 전날 리마인더 (day-before-reminder: 0 9 * * * UTC = KST 18:00)
UPDATE message_templates SET trigger_info = '예약 전날 18:00' WHERE type_code = '4-1';

-- 4-3: 전날 리마인더 회원용 (동일 크론)
UPDATE message_templates SET trigger_info = '예약 전날 18:00' WHERE type_code = '4-3';

-- 4-2: 당일 리마인더 (same-day-reminder: 0 1 * * * UTC = KST 10:00) - 정확함
-- UPDATE message_templates SET trigger_info = '예약 당일 10:00' WHERE type_code = '4-2';

-- 3-2: 입금 리마인더 (payment-reminder-d7/5/2: 0 5 * * * UTC = KST 14:00)
UPDATE message_templates SET trigger_info = 'D-7/5/2 오후 14:00 (자동 리마인더)' WHERE type_code = '3-2';

-- 5-2: 재무 미입금 알림 (finance-alert-follow: 0 4 * * * UTC = KST 13:00)
UPDATE message_templates SET trigger_info = '매일 오후 13:00 (관리자용)' WHERE type_code = '5-2';

SELECT type_code, trigger_info FROM message_templates WHERE type_code IN ('3-2', '4-1', '4-2', '4-3', '5-2') ORDER BY type_code;
