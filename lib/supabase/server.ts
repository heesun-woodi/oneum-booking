import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// 이 앱의 모든 DB 접근은 service_role 로 한다.
// anon 키는 NEXT_PUBLIC_ 이라 브라우저 번들에 실리는 공개 값이고, 커스텀 인증이라
// anon 클라이언트에는 사용자 컨텍스트가 실리지 않는다 — 서버에서 쓸 이유가 없다.
// 마이그레이션 036 이 anon 역할의 public 스키마 권한을 전부 회수한다.
// service_role 은 RLS 를 우회하므로 인가는 코드가 책임진다 (lib/admin-guard.ts 의
// assertAdmin, 공개 액션의 컬럼 화이트리스트).

// Service Role 클라이언트 (RLS 우회, 서버 전용)
export async function createServiceRoleClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  return createSupabaseClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}
