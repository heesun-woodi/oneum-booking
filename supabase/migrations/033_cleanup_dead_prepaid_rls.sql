-- Migration 033: 선불권 테이블의 죽은 RLS 정책 정리
--
-- 배경:
--   013/014 가 만든 prepaid_purchases / prepaid_usages 정책은 전부 auth.uid() 기반이다.
--   그런데 이 앱은 Supabase Auth 를 쓰지 않는 커스텀 인증(users.password_hash + bcrypt)이라
--   DB 세션에 인증 주체가 실려오지 않는다. 즉 auth.uid() 는 항상 NULL 이고,
--   auth.uid() = user_id 는 NULL 로 평가되어 어떤 행도 매칭하지 않는다.
--
--   결과적으로 이 정책들은 "본인 것만 허용"이 아니라 "전부 차단"으로 동작해 왔다.
--   보호처럼 보이지만 실제로는 아무 의미가 없고, 오히려 032 에서 고친 버그
--   (취소 시 선불권 복구가 조용히 0건 처리)의 직접적 원인이었다.
--   RLS 는 UPDATE/DELETE 를 막을 때 예외 없이 0건으로 끝내기 때문이다.
--
-- 현재 실제 접근 경로 (코드 전수 확인 완료):
--   prepaid_purchases  → 전부 service_role (admin-prepaid, prepaid, api/prepaid/*,
--                        booking-utils, bookings, cron/jobs) — RLS 우회
--   prepaid_usages     → 전부 service_role
--   prepaid_products   → app/api/prepaid/products/route.ts 만 anon 으로 SELECT
--                        ("Anyone can view active products" 정책은 auth.uid() 를 쓰지 않아
--                         정상 동작한다. 반드시 유지할 것)
--
-- 따라서 이 마이그레이션은 동작 변화가 없다(no-op). 죽은 정책을 걷어내고
-- "이 두 테이블은 service_role 전용"이라는 실제 보안 모델을 명시할 뿐이다.
--
-- 적용 전후 확인:
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE tablename LIKE 'prepaid%' ORDER BY tablename, policyname;

-- =====================================================
-- 1. 죽은 정책 제거 (이름 지정 — 다른 정책은 건드리지 않는다)
-- =====================================================
DROP POLICY IF EXISTS "Users can view own purchases"   ON prepaid_purchases;
DROP POLICY IF EXISTS "Users can insert own purchases" ON prepaid_purchases;
DROP POLICY IF EXISTS "Users can update own purchases" ON prepaid_purchases;
DROP POLICY IF EXISTS "Users can view own usages"      ON prepaid_usages;

-- =====================================================
-- 2. RLS 는 켜둔 채 정책 0개 = 명시적 deny-by-default
--    (service_role 은 RLS 를 우회하므로 영향 없음)
-- =====================================================
ALTER TABLE prepaid_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE prepaid_usages    ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 3. 테이블 권한도 회수 (belt-and-suspenders)
--    RLS 정책이 없으면 이미 차단되지만, 나중에 누군가 대시보드에서
--    RLS 를 끄더라도 anon 키로 뚫리지 않도록 권한 자체를 없앤다.
--    anon 키는 NEXT_PUBLIC_ 이라 브라우저 번들에 그대로 실린다 = 공개 값이다.
-- =====================================================
REVOKE ALL ON prepaid_purchases FROM anon, authenticated;
REVOKE ALL ON prepaid_usages    FROM anon, authenticated;

-- prepaid_products 는 anon SELECT 가 실제로 쓰인다. 유지.
GRANT SELECT ON prepaid_products TO anon, authenticated;

COMMENT ON TABLE prepaid_purchases IS
  '선불권 구매. service_role 전용 — 클라이언트 직접 접근 금지(RLS deny-by-default + 권한 회수).';
COMMENT ON TABLE prepaid_usages IS
  '선불권 사용 내역. service_role 전용 — 클라이언트 직접 접근 금지(RLS deny-by-default + 권한 회수).';
