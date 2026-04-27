-- 선불권 시간 단위를 NUMERIC(10,1)로 변경 (0.5시간 단위 지원)
ALTER TABLE prepaid_purchases
  ALTER COLUMN total_hours TYPE NUMERIC(10,1),
  ALTER COLUMN remaining_hours TYPE NUMERIC(10,1);

ALTER TABLE prepaid_usages
  ALTER COLUMN hours_used TYPE NUMERIC(10,1);

ALTER TABLE bookings
  ALTER COLUMN prepaid_hours_used TYPE NUMERIC(10,1),
  ALTER COLUMN regular_hours TYPE NUMERIC(10,1);
