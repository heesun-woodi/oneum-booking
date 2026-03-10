'use server'

import { createClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'

export async function adminLogin(email: string, password: string) {
  try {
    const supabase = await createClient()
    
    // 1. 관리자 조회
    const { data: admin, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email)
      .eq('is_active', true)
      .single()
    
    if (error || !admin) {
      return { success: false, error: '계정을 찾을 수 없습니다.' }
    }
    
    // 2. 비밀번호 검증
    const isValid = await bcrypt.compare(password, admin.password_hash)
    if (!isValid) {
      return { success: false, error: '비밀번호가 올바르지 않습니다.' }
    }
    
    // 3. 마지막 로그인 시간 업데이트
    await supabase
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id)
    
    // 4. 세션 데이터 반환 (민감 정보 제외)
    const session = {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role
    }
    
    return { success: true, admin: session }
  } catch (error) {
    console.error('Admin login error:', error)
    return { success: false, error: '로그인 중 오류가 발생했습니다.' }
  }
}

export async function adminLogout() {
  return { success: true }
}
