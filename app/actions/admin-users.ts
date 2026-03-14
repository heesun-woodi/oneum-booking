'use server'

import { createClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications/sender'

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
    
    // 사용자 정보 조회
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (fetchError || !user) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' }
    }
    
    // 승인 처리
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
    
    // ===== 📨 알림 발송 =====
    // 1-2: 신청자에게 승인 알림
    await sendNotification({
      type: '1-2',
      phone: user.phone,
      variables: {
        name: user.name,
        household: user.household,
      },
      userId: user.id,
    })
    
    return { success: true, message: '승인되었습니다.' }
  } catch (error) {
    console.error('Approve signup error:', error)
    return { success: false, error: '승인 중 오류가 발생했습니다.' }
  }
}

export async function rejectSignup(userId: string, adminId: string, reason: string) {
  try {
    const supabase = await createClient()
    
    // 사용자 정보 조회
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single()
    
    if (fetchError || !user) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' }
    }
    
    // 거부 처리
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
    
    // ===== 📨 알림 발송 =====
    // 1-3: 신청자에게 거부 알림
    await sendNotification({
      type: '1-3',
      phone: user.phone,
      variables: {
        name: user.name,
        reason: reason,
      },
      userId: user.id,
    })
    
    return { success: true, message: '거부되었습니다.' }
  } catch (error) {
    console.error('Reject signup error:', error)
    return { success: false, error: '거부 중 오류가 발생했습니다.' }
  }
}
