-- 003_admin_role.sql
-- 관리자 권한 관리 기능 추가

-- users 테이블에 is_admin 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- 기존 관리자 계정 설정 (예: 301호)
-- 실제 운영 환경에서는 적절한 세대로 변경
UPDATE users 
SET is_admin = TRUE 
WHERE household = '301' AND status = 'approved';

-- 인덱스 추가 (관리자 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;
