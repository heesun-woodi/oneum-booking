-- ===== 관리자 계정 업데이트 =====
-- 실행 방법: Supabase Dashboard > SQL Editor에서 실행

-- 1. 기존 admin 계정 삭제 (선택사항)
DELETE FROM admin_users WHERE email = 'admin@oneum.com';

-- 2. 새 관리자 계정 생성
-- 이메일: iloveccmel@gmail.com
-- 비밀번호: 1234
INSERT INTO admin_users (email, password_hash, name, role)
VALUES (
  'iloveccmel@gmail.com',
  '$2b$10$uo1uZHgMg7b9MoffdNNzTOfqu1szxvlv2mIVfpWfI5jNaZnUrpDG.',
  '우디',
  'super_admin'
)
ON CONFLICT (email) DO UPDATE SET
  password_hash = EXCLUDED.password_hash,
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  is_active = true;

SELECT '관리자 계정 업데이트 완료!' as message;
SELECT email, name, role, is_active FROM admin_users WHERE email = 'iloveccmel@gmail.com';
