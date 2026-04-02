-- Phase 6.1: 회원 정책 변경 - 누구나 가입 가능
-- 작성일: 2026-04-02

-- ===== 1. users 테이블 변경 =====

-- 세대원 여부 컬럼 추가
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS is_resident BOOLEAN DEFAULT false;

COMMENT ON COLUMN users.is_resident IS '세대원 여부 (true: 201~501호 입주민, false: 외부인)';

-- household 컬럼을 NULL 허용으로 변경 (일반 회원은 세대 번호 없음)
ALTER TABLE users 
  ALTER COLUMN household DROP NOT NULL;

-- 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_users_is_resident ON users(is_resident);

-- ===== 2. signups 테이블 변경 (만약 있다면) =====

-- signups 테이블이 있으면 동일하게 처리
DO $$ 
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'signups'
  ) THEN
    ALTER TABLE signups 
      ADD COLUMN IF NOT EXISTS is_resident BOOLEAN DEFAULT false;
    
    COMMENT ON COLUMN signups.is_resident IS '세대원 여부 (true: 201~501호 입주민, false: 외부인)';
    
    ALTER TABLE signups 
      ALTER COLUMN household DROP NOT NULL;
  END IF;
END $$;

-- ===== 3. 기존 데이터 마이그레이션 =====

-- 기존 회원들은 모두 세대원이므로 is_resident = true로 설정
UPDATE users 
SET is_resident = true 
WHERE household IS NOT NULL;

-- signups 테이블도 동일하게 처리
UPDATE signups 
SET is_resident = true 
WHERE household IS NOT NULL
AND EXISTS (
  SELECT 1 FROM information_schema.tables 
  WHERE table_schema = 'public' 
  AND table_name = 'signups'
);
