'use server'

import { supabase } from '@/lib/supabase'
import bcrypt from 'bcryptjs'

export async function signup(data: {
  household: string
  name: string
  phone: string
  password: string
}) {
  // 1. 중복 체크 (household + name)
  const { data: existing } = await supabase
    .from('users')
    .select('id')
    .eq('household', data.household)
    .eq('name', data.name)
    .single()
  
  if (existing) {
    return { success: false, error: '이미 등록된 이름입니다.' }
  }
  
  // 2. 비밀번호 해시
  const passwordHash = await bcrypt.hash(data.password, 10)
  
  // 3. 사용자 생성
  const { data: user, error } = await supabase
    .from('users')
    .insert({
      household: data.household,
      name: data.name,
      phone: data.phone,
      password_hash: passwordHash
    })
    .select()
    .single()
  
  if (error) {
    return { success: false, error: error.message }
  }
  
  return { success: true, user }
}

export async function login(data: {
  name: string
  password: string
}) {
  // 1. 이름으로 사용자 조회
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
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
  
  return { success: true, user }
}
