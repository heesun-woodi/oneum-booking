'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'
import { sendNotification } from '@/lib/notifications/sender'

export async function signup(data: {
  household: string
  name: string
  phone: string
  password: string
  isResident?: boolean // Phase 6.1: 세대원 여부 추가
}) {
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
      phone: data.phone,
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
  name: string
  password: string
}) {
  // 1. 이름으로 사용자 조회 (id 명시적으로 포함)
  const { data: user, error } = await supabase
    .from('users')
    .select('id, household, name, phone, password_hash, status, is_admin, is_resident')
    .eq('name', data.name)
    .single()
  
  if (error || !user) {
    return { success: false, error: '이름을 찾을 수 없습니다.' }
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
  
  return { success: true, user }
}
