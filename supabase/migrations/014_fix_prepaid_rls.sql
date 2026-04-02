-- Phase 6.2 수정: prepaid_purchases RLS 정책 추가
-- 작성일: 2026-04-02
-- 이슈: INSERT/UPDATE 권한 누락으로 API 실패

-- =====================================================
-- prepaid_purchases INSERT 정책 추가
-- =====================================================
CREATE POLICY "Users can insert own purchases" ON prepaid_purchases
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- =====================================================
-- prepaid_purchases UPDATE 정책 추가 (환불용)
-- =====================================================
CREATE POLICY "Users can update own purchases" ON prepaid_purchases
  FOR UPDATE USING (auth.uid() = user_id);

-- =====================================================
-- 확인
-- =====================================================
-- 정책 목록 확인:
-- SELECT * FROM pg_policies WHERE tablename = 'prepaid_purchases';
