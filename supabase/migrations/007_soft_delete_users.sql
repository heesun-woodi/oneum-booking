-- 007_soft_delete_users.sql
-- 회원 삭제를 Soft Delete 방식으로 변경
-- 작성일: 2026-04-01
-- 작성자: Buzz (AI Assistant)

-- users 테이블에 deleted_at 컬럼 추가
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 삭제된 회원 필터링을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_users_deleted_at 
  ON users(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- 완료
SELECT '✅ Soft Delete 컬럼 추가 완료! deleted_at 필드로 회원 비활성화 가능' as message;
