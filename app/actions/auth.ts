'use server'

import { supabase } from '@/lib/supabase'
import { createServiceRoleClient } from '@/lib/supabase/server'
import bcrypt from 'bcryptjs'
import { sendNotification } from '@/lib/notifications/sender'
import { solapi } from '@/lib/solapi'

export async function signup(data: {
  household: string
  name: string
  phone: string
  password: string
  isResident?: boolean // Phase 6.1: 세대원 여부 추가
}) {
  // 전화번호 중복 체크 (세대원/비세대원 무관)
  const normalizedPhone = data.phone.replace(/[^0-9]/g, '')
  const { data: existingPhone } = await supabase
    .from('users')
    .select('id')
    .eq('phone', normalizedPhone)
    .in('status', ['pending', 'approved'])
    .is('deleted_at', null)
    .maybeSingle()

  if (existingPhone) {
    return { success: false, error: '이미 가입된 전화번호입니다.' }
  }

  // Phase 6.1: 세대원인 경우에만 중복 체크 (household + name)
  if (data.isResident && data.household) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('household', data.household)
      .eq('name', data.name)
      .single()
    
    if (existing) {
      return { success: false, error: '이미 등록된 이름입니다.' }
    }
  }
  
  // 2. 비밀번호 해시
  const passwordHash = await bcrypt.hash(data.password, 10)
  
  // 3. 사용자 생성 (status: pending)
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      household: data.isResident ? data.household : null, // Phase 6.1: 일반 회원은 null
      name: data.name,
      phone: normalizedPhone,
      password_hash: passwordHash,
      status: 'pending',  // 가입 대기 상태
      is_resident: data.isResident ?? false // Phase 6.1: 세대원 여부
    })
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  // ===== 📨 알림 발송 =====
  // 6-1: 관리자에게 회원가입 신청 알림
  await sendNotification({
    type: '6-1',
    phone: process.env.ADMIN_PHONE || '',
    recipientName: '관리자',
    variables: {
      name: data.name,
      household: data.isResident ? data.household : '일반회원', // Phase 6.1: 일반회원 표시
      phone: data.phone,
      adminUrl: process.env.NEXT_PUBLIC_APP_URL
        ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/users`
        : 'https://oneum.vercel.app/admin/users',
    },
    userId: user.id,
  })
  
  return { 
    success: true, 
    user,
    message: '가입 신청이 완료되었습니다. 승인 후 로그인 가능합니다.'
  }
}

export async function login(data: {
  phone: string
  password: string
}) {
  // 1. 전화번호로 사용자 조회 (하이픈 유무 무관하게 조회)
  const normalizedPhone = data.phone.replace(/[^0-9]/g, '')
  const formattedPhone = normalizedPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')

  const selectFields = 'id, household, name, phone, password_hash, status, is_admin, is_resident'
  let user = null

  const adminClient = await createServiceRoleClient()
  const { data: r1 } = await adminClient
    .from('users').select(selectFields).eq('phone', normalizedPhone).is('deleted_at', null)
    .order('created_at', { ascending: false }).limit(1)
  if (r1 && r1.length > 0) {
    user = r1[0]
  } else {
    const { data: r2 } = await adminClient
      .from('users').select(selectFields).eq('phone', formattedPhone).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(1)
    if (r2 && r2.length > 0) user = r2[0]
  }

  if (!user) {
    return { success: false, error: '전화번호를 찾을 수 없습니다.' }
  }
  
  // 2. 비밀번호 확인
  const isValid = await bcrypt.compare(data.password, user.password_hash)
  
  if (!isValid) {
    return { success: false, error: '비밀번호가 올바르지 않습니다.' }
  }
  
  // 3. 승인 상태 확인
  if (user.status === 'pending') {
    return { success: false, error: '가입 승인 대기 중입니다. 관리자 승인 후 이용 가능합니다.' }
  }
  
  if (user.status === 'rejected') {
    return { success: false, error: '가입이 거부되었습니다. 관리자에게 문의하세요.' }
  }
  
  // 🐛 FIX: userId 포함 확인용 로그
  console.log('✅ [LOGIN] user.id:', user.id)

  // 비회원 예약 병합: 같은 전화번호의 user_id 없는 예약을 현재 계정으로 연결
  const fp = normalizedPhone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
  await adminClient.from('bookings').update({ user_id: user.id })
    .is('user_id', null).eq('phone', normalizedPhone)
  await adminClient.from('bookings').update({ user_id: user.id })
    .is('user_id', null).eq('phone', fp)

  return { success: true, user }
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  // 1. fetch user by id
  const { data: user, error } = await supabase
    .from('users')
    .select('id, password_hash')
    .eq('id', userId)
    .single()

  if (error || !user) {
    return { success: false, error: '사용자를 찾을 수 없습니다.' }
  }

  // 2. verify current password
  const isValid = await bcrypt.compare(currentPassword, user.password_hash)
  if (!isValid) {
    return { success: false, error: '현재 비밀번호가 올바르지 않습니다.' }
  }

  // 3. hash new password
  const newHash = await bcrypt.hash(newPassword, 10)

  // 4. update password_hash
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: newHash })
    .eq('id', userId)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  return { success: true }
}

export async function resetPassword(name: string, phone: string) {
  // 1. normalize phone (digits only)
  const normalizedPhone = phone.replace(/\D/g, '')

  // 2. find user
  const { data: user, error } = await supabase
    .from('users')
    .select('id, phone')
    .eq('name', name)
    .eq('phone', normalizedPhone)
    .eq('status', 'approved')
    .single()

  if (error || !user) {
    return { success: false, error: '일치하는 회원 정보를 찾을 수 없습니다.' }
  }

  // 3. generate 6-char alphanumeric temp password (uppercase + digits)
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let tempPassword = ''
  for (let i = 0; i < 6; i++) {
    tempPassword += chars[Math.floor(Math.random() * chars.length)]
  }

  // 4. hash and update
  const newHash = await bcrypt.hash(tempPassword, 10)
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: newHash })
    .eq('id', user.id)

  if (updateError) {
    return { success: false, error: updateError.message }
  }

  // 5. send SMS
  const message = `[온음] 임시 비밀번호: ${tempPassword}\n로그인 후 비밀번호를 변경해주세요.`
  await solapi.sendAuto(normalizedPhone, message)

  return { success: true }
}
