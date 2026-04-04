-- bookings_payment_status_check constraint 수정
-- 기존: ('pending', 'completed', 'refunded')
-- 수정: ('pending', 'completed', 'refunded', 'prepaid')

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS bookings_payment_status_check;
ALTER TABLE bookings ADD CONSTRAINT bookings_payment_status_check 
  CHECK (payment_status IN ('pending', 'completed', 'refunded', 'prepaid'));
