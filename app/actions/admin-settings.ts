'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ===== 타입 정의 =====
export interface SpacePricing {
  member: string
  nonMember: string
}

export interface SpaceInfo {
  id: string
  name: string
  description: string
  capacity: string
  facilities: string[]
  rules: string[]
  hours: string
  pricing: SpacePricing
}

export interface GeneralRules {
  booking: string[]
  cancellation: string[]
  payment: string[]
  usage: string[]
}

// ===== 기본값 =====
const defaultSpacesInfo: Record<string, Omit<SpaceInfo, 'id'>> = {
  nolter: {
    name: '놀터',
    description: '아이들이 자유롭게 놀 수 있는 공간',
    capacity: '최대 8명',
    facilities: ['장난감', '매트', '보드게임', '에어컨/난방'],
    rules: ['신발을 벗고 입장해주세요', '음식물 반입 금지', '사용 후 정리정돈', '시설물 파손 시 변상'],
    hours: '09:00 ~ 22:00',
    pricing: {
      member: '무료 (월 8시간까지)',
      nonMember: '14,000원/시간',
    }
  },
  soundroom: {
    name: '방음실',
    description: '악기 연습, 노래 연습이 가능한 방음 공간',
    capacity: '최대 4명',
    facilities: ['방음시설', '마이크', '스피커', '의자'],
    rules: ['악기는 개인 지참', '음량 조절 협조', '사용 후 정리정돈', '시설물 파손 시 변상'],
    hours: '09:00 ~ 22:00',
    pricing: {
      member: '무료 (월 8시간까지)',
      nonMember: '14,000원/시간',
    }
  }
}

const defaultGeneralRules: GeneralRules = {
  booking: [
    '예약은 1일 전까지 가능합니다 (당일 예약 불가)',
    '회원은 월 8시간까지 무료 이용',
    '초과 시간은 14,000원/시간',
    '비회원은 모든 이용에 14,000원/시간',
  ],
  cancellation: [
    '이용일 2일 전까지 무료 취소',
    '이용일 1일 전 취소 시 50% 환불',
    '당일 취소 시 환불 불가',
  ],
  payment: [
    '비회원 예약 후 이용일 1일 전까지 입금',
    '입금 계좌: 카카오뱅크 7979-72-56275 (정상은)',
    '예금주명과 예약자명이 다를 경우 사전 연락',
  ],
  usage: [
    '예약 시간 엄수',
    '타인에게 방해되는 행위 금지',
    '쓰레기는 되가져가기',
    '시설물 고의 파손 시 변상',
  ],
}

// ===== 공간 정보 조회 (DB) =====
export async function getSpaceInfo(): Promise<{ success: boolean; spaces: SpaceInfo[]; error?: string }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'spaces_info')
    .single()

  if (error || !data) {
    console.log('spaces_info not found in DB, using defaults')
    // DB에 없으면 기본값 반환
    const spaces = Object.entries(defaultSpacesInfo).map(([id, space]) => ({
      id,
      ...space
    }))
    return { success: true, spaces }
  }

  try {
    const parsed = JSON.parse(data.value)
    const spaces = Object.entries(parsed).map(([id, space]: [string, any]) => ({
      id,
      ...space
    }))
    return { success: true, spaces }
  } catch (e) {
    console.error('Failed to parse spaces_info:', e)
    const spaces = Object.entries(defaultSpacesInfo).map(([id, space]) => ({
      id,
      ...space
    }))
    return { success: true, spaces }
  }
}

// ===== 공간 정보 저장 (DB) =====
export async function updateSpaceInfo(spaces: SpaceInfo[]): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceRoleClient()
  
  // 배열을 객체로 변환 (nolter, soundroom 키 사용)
  const spacesObj: Record<string, Omit<SpaceInfo, 'id'>> = {}
  for (const space of spaces) {
    const { id, ...rest } = space
    spacesObj[id] = rest
  }

  const value = JSON.stringify(spacesObj)

  // upsert
  const { data: existing } = await supabase
    .from('site_settings')
    .select('id')
    .eq('key', 'spaces_info')
    .single()

  let error
  if (existing) {
    const { error: updateError } = await supabase
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', 'spaces_info')
    error = updateError
  } else {
    const { error: insertError } = await supabase
      .from('site_settings')
      .insert({ key: 'spaces_info', value })
    error = insertError
  }

  if (error) {
    console.error('Failed to update spaces_info:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/admin/settings')
  return { success: true }
}

// ===== 이용 규칙 조회 (DB) =====
export async function getGeneralRules(): Promise<{ success: boolean; rules: GeneralRules; error?: string }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'general_rules')
    .single()

  if (error || !data) {
    console.log('general_rules not found in DB, using defaults')
    return { success: true, rules: defaultGeneralRules }
  }

  try {
    const parsed = JSON.parse(data.value)
    return { success: true, rules: parsed }
  } catch (e) {
    console.error('Failed to parse general_rules:', e)
    return { success: true, rules: defaultGeneralRules }
  }
}

// ===== 이용 규칙 저장 (DB) =====
export async function updateGeneralRules(rules: GeneralRules): Promise<{ success: boolean; error?: string }> {
  const supabase = createServiceRoleClient()
  
  const value = JSON.stringify(rules)

  // upsert
  const { data: existing } = await supabase
    .from('site_settings')
    .select('id')
    .eq('key', 'general_rules')
    .single()

  let error
  if (existing) {
    const { error: updateError } = await supabase
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', 'general_rules')
    error = updateError
  } else {
    const { error: insertError } = await supabase
      .from('site_settings')
      .insert({ key: 'general_rules', value })
    error = insertError
  }

  if (error) {
    console.error('Failed to update general_rules:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/admin/settings')
  return { success: true }
}
