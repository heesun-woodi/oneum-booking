-- site_settings에 usage_rules 초기 데이터 INSERT
-- Supabase SQL Editor에서 실행하세요: https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui/sql

INSERT INTO site_settings (key, value) VALUES (
    'usage_rules',
    '## 🗓 예약 규정

- 예약은 1일 전까지 가능합니다 (당일 예약 불가)
- 회원은 월 8시간까지 무료 이용
- 초과 시간은 14,000원/시간
- 비회원은 모든 이용에 14,000원/시간

## 😊 취소 및 환불

- 이용일 2일 전까지 무료 취소
- 이용일 1일 전 취소 시 50% 환불
- 당일 취소 시 환불 불가

## 💳 입금 안내

- 비회원 예약 후 이용일 1일 전까지 입금
- 입금 계좌: 카카오뱅크 7979-72-56275 (정상은)
- 예금주명과 예약자명이 다를 경우 사전 연락

## ⚠ 이용 수칙

- 예약 시간 엄수
- 타인에게 방해되는 행위 금지
- 쓰레기는 되가져가기
- 시설물 고의 파손 시 변상'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
