import { createClient } from '@/lib/supabase/server'

/**
 * 사용자의 관리자 권한 확인
 * @param phone - 전화번호
 * @returns 관리자 여부 (true/false)
 */
export async function checkAdmin(phone: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('phone', phone)
      .eq('status', 'approved')
      .single()
    
    if (error || !data) {
      return false
    }
    
    return data.is_admin === true
  } catch (error) {
    console.error('Check admin error:', error)
    return false
  }
}

/**
 * 사용자 ID로 관리자 권한 확인
 * @param userId - 사용자 ID
 * @returns 관리자 여부 (true/false)
 */
export async function checkAdminById(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('id', userId)
      .eq('status', 'approved')
      .single()
    
    if (error || !data) {
      return false
    }
    
    return data.is_admin === true
  } catch (error) {
    console.error('Check admin by ID error:', error)
    return false
  }
}

/**
 * 세대번호로 관리자 권한 확인
 * @param household - 세대번호
 * @returns 관리자 여부 (true/false)
 */
export async function checkAdminByHousehold(household: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('users')
      .select('is_admin')
      .eq('household', household)
      .eq('status', 'approved')
      .single()
    
    if (error || !data) {
      return false
    }
    
    return data.is_admin === true
  } catch (error) {
    console.error('Check admin by household error:', error)
    return false
  }
}
