-- ===== Phase 5.1: 관리자 인증 시스템 =====
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행

-- 1. admin_users 테이블 생성
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin' CHECK (role IN ('super_admin', 'admin', 'viewer')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- 3. RLS 활성화
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- 4. 전체 접근 정책
CREATE POLICY "Enable all operations for admin_users" ON admin_users FOR ALL USING (true);

-- 5. 첫 관리자 계정 생성
-- 이메일: admin@oneum.com
-- 비밀번호: admin1234
INSERT INTO admin_users (email, password_hash, name, role)
VALUES (
  'admin@oneum.com',
  '$2b$10$aMt7jZlRNoay8ScysVFHxep6.Y.CWtmK.gCld0/hEkLriGmMjGnEm',
  '관리자',
  'super_admin'
)
ON CONFLICT (email) DO NOTHING;

SELECT 'admin_users 테이블 생성 완료!' as message;

-- ===== Phase 5.1 추가: 회원가입 승인 기능 =====

-- 1. users 테이블에 승인 관련 컬럼 추가
ALTER TABLE users ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending' 
  CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejected_reason TEXT;

-- 2. 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

-- 3. 기존 사용자들 모두 승인 상태로 변경 (마이그레이션)
UPDATE users SET status = 'approved' WHERE status IS NULL OR status = 'pending';

SELECT '회원가입 승인 기능 추가 완료!' as message;
