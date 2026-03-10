'use server'

import { createClient } from '@/lib/supabase/server'

export async function getSignupRequests(status: 'pending' | 'approved' | 'rejected' = 'pending') {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('status', status)
      .order('created_at', { ascending: false })
    
    if (error) {
      return { success: false, error: error.message, users: [] }
    }
    
    return { success: true, users: data || [] }
  } catch (error) {
    console.error('Get signup requests error:', error)
    return { success: false, error: '조회 중 오류가 발생했습니다.', users: [] }
  }
}

export async function approveSignup(userId: string, adminId: string) {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('users')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        approved_by: adminId
      })
      .eq('id', userId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    // TODO: 알림톡 발송 (Phase 5.4)
    
    return { success: true, message: '승인되었습니다.' }
  } catch (error) {
    console.error('Approve signup error:', error)
    return { success: false, error: '승인 중 오류가 발생했습니다.' }
  }
}

export async function rejectSignup(userId: string, adminId: string, reason: string) {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('users')
      .update({
        status: 'rejected',
        rejected_at: new Date().toISOString(),
        rejected_reason: reason
      })
      .eq('id', userId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    // TODO: 알림톡 발송 (Phase 5.4)
    
    return { success: true, message: '거부되었습니다.' }
  } catch (error) {
    console.error('Reject signup error:', error)
    return { success: false, error: '거부 중 오류가 발생했습니다.' }
  }
}
