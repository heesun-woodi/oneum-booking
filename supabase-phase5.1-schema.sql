-- ===== Phase 5.1: 관리자 시스템 스키마 =====
-- Supabase SQL Editor에서 실행

-- ===== 관리자 사용자 테이블 =====
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin' 
    CHECK (role IN ('super_admin', 'admin', 'viewer')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_login_at TIMESTAMP WITH TIME ZONE
);

-- ===== RLS 정책 =====
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read for service role only" ON admin_users
  FOR SELECT USING (true);

-- ===== signups 테이블에 승인 관련 컬럼 추가 =====
ALTER TABLE signups 
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected'));

ALTER TABLE signups 
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admin_users(id);

ALTER TABLE signups 
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE signups 
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- ===== 인덱스 =====
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_signups_status ON signups(status);

-- ===== 초기 관리자 계정 =====
-- 비밀번호: admin123! (배포 후 즉시 변경 필수!)
INSERT INTO admin_users (email, password_hash, name, role)
VALUES (
  'admin@oneum.kr',
  '$2b$10$COl7o7zigrQwhCz6G2Gk5ObUaBudWjdhFJaXnluipOlCCR76dQoNG',
  '관리자',
  'super_admin'
)
ON CONFLICT (email) DO NOTHING;

-- 완료!
-- 이제 admin@oneum.kr / admin123! 로 로그인할 수 있습니다.
