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

/**
 * 사용자의 관리자 권한 설정/해제
 * @param userId - 사용자 ID
 * @param isAdmin - 관리자 권한 여부 (true/false)
 * @returns 성공 여부
 */
export async function setAdminRole(userId: string, isAdmin: boolean) {
  try {
    const supabase = await createClient()
    
    // 사용자가 승인된 상태인지 확인
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('status, name, household')
      .eq('id', userId)
      .single()
    
    if (fetchError || !user) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' }
    }
    
    if (user.status !== 'approved') {
      return { success: false, error: '승인된 사용자만 관리자로 지정할 수 있습니다.' }
    }
    
    // 관리자 권한 업데이트
    const { error } = await supabase
      .from('users')
      .update({ is_admin: isAdmin })
      .eq('id', userId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    console.log(`✅ 관리자 권한 ${isAdmin ? '부여' : '해제'}: ${user.household}호 ${user.name}`)
    
    return { 
      success: true, 
      message: `${user.name}님의 관리자 권한이 ${isAdmin ? '부여' : '해제'}되었습니다.` 
    }
  } catch (error) {
    console.error('Set admin role error:', error)
    return { success: false, error: '권한 설정 중 오류가 발생했습니다.' }
  }
}

/**
 * 승인된 사용자 정보 수정
 * @param userId - 사용자 ID
 * @param data - 수정할 데이터 (name, phone)
 * @returns 성공 여부
 */
export async function updateUser(userId: string, data: { name?: string; phone?: string }) {
  try {
    const supabase = await createClient()
    
    // 입력 검증
    if (data.phone) {
      const phoneRegex = /^010-\d{4}-\d{4}$/
      if (!phoneRegex.test(data.phone)) {
        return { success: false, error: '전화번호 형식이 올바르지 않습니다. (010-XXXX-XXXX)' }
      }
    }
    
    // 사용자 정보 조회
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('status, household')
      .eq('id', userId)
      .single()
    
    if (fetchError || !user) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' }
    }
    
    if (user.status !== 'approved') {
      return { success: false, error: '승인된 사용자만 수정할 수 있습니다.' }
    }
    
    // 이름 중복 체크 (같은 세대 내)
    if (data.name) {
      const { data: duplicateUser } = await supabase
        .from('users')
        .select('id')
        .eq('household', user.household)
        .eq('name', data.name)
        .neq('id', userId)
        .single()
      
      if (duplicateUser) {
        return { success: false, error: '같은 세대에 동일한 이름이 이미 존재합니다.' }
      }
    }
    
    // 업데이트할 데이터 준비
    const updateData: any = {}
    if (data.name) updateData.name = data.name
    if (data.phone) updateData.phone = data.phone
    
    // 사용자 정보 업데이트
    const { error } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', userId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    console.log(`✅ 사용자 정보 수정: ${user.household}호`)
    
    return { success: true, message: '사용자 정보가 수정되었습니다.' }
  } catch (error) {
    console.error('Update user error:', error)
    return { success: false, error: '사용자 정보 수정 중 오류가 발생했습니다.' }
  }
}

/**
 * 승인된 사용자 삭제
 * @param userId - 사용자 ID
 * @param currentUserId - 현재 로그인한 관리자 ID (자기 자신 삭제 방지)
 * @returns 성공 여부
 */
export async function deleteUser(userId: string, currentUserId: string) {
  try {
    const supabase = await createClient()
    
    // 자기 자신 삭제 방지
    if (userId === currentUserId) {
      return { success: false, error: '자기 자신은 삭제할 수 없습니다.' }
    }
    
    // 사용자 정보 조회
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('status, name, household')
      .eq('id', userId)
      .single()
    
    if (fetchError || !user) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' }
    }
    
    if (user.status !== 'approved') {
      return { success: false, error: '승인된 사용자만 삭제할 수 있습니다.' }
    }
    
    // 예약 건수 확인
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('id')
      .eq('user_id', userId)
    
    if (bookingsError) {
      return { success: false, error: '예약 정보 조회 중 오류가 발생했습니다.' }
    }
    
    if (bookings && bookings.length > 0) {
      return { 
        success: false, 
        error: `이 사용자는 ${bookings.length}건의 예약 내역이 있어 삭제할 수 없습니다. 먼저 예약을 취소해주세요.` 
      }
    }
    
    // 사용자 삭제
    const { error } = await supabase
      .from('users')
      .delete()
      .eq('id', userId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    console.log(`✅ 사용자 삭제: ${user.household}호 ${user.name}`)
    
    return { success: true, message: `${user.name}님이 삭제되었습니다.` }
  } catch (error) {
    console.error('Delete user error:', error)
    return { success: false, error: '사용자 삭제 중 오류가 발생했습니다.' }
  }
}

/**
 * 비밀번호 재설정
 * @param userId - 사용자 ID
 * @param newPassword - 새 비밀번호
 * @returns 성공 여부
 */
export async function resetPassword(userId: string, newPassword: string) {
  try {
    const supabase = await createClient()
    const bcrypt = require('bcryptjs')
    
    // 비밀번호 검증
    if (newPassword.length < 4) {
      return { success: false, error: '비밀번호는 최소 4자 이상이어야 합니다.' }
    }
    
    // 사용자 정보 조회
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('status, name, household')
      .eq('id', userId)
      .single()
    
    if (fetchError || !user) {
      return { success: false, error: '사용자를 찾을 수 없습니다.' }
    }
    
    if (user.status !== 'approved') {
      return { success: false, error: '승인된 사용자만 비밀번호를 재설정할 수 있습니다.' }
    }
    
    // 비밀번호 해시화
    const hashedPassword = await bcrypt.hash(newPassword, 10)
    
    // 비밀번호 업데이트
    const { error } = await supabase
      .from('users')
      .update({ password: hashedPassword })
      .eq('id', userId)
    
    if (error) {
      return { success: false, error: error.message }
    }
    
    console.log(`✅ 비밀번호 재설정: ${user.household}호 ${user.name}`)
    
    return { success: true, message: `${user.name}님의 비밀번호가 재설정되었습니다.` }
  } catch (error) {
    console.error('Reset password error:', error)
    return { success: false, error: '비밀번호 재설정 중 오류가 발생했습니다.' }
  }
}
