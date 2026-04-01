'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ===== 타입 정의 =====

export interface SpaceInfo {
  name: string
  description: string
  capacity: string
  facilities: string[]
  rules: string[]
  hours: string
  pricing: {
    member: string
    nonMember: string
  }
}

export interface SpacesInfo {
  nolter: SpaceInfo
  soundroom: SpaceInfo
}

export interface GeneralRules {
  booking: string[]
  cancellation: string[]
  payment: string[]
  usage: string[]
}

// ===== 공간 정보 =====

export async function getSpacesInfo(): Promise<{ success: boolean; data?: SpacesInfo; error?: string }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'spaces_info')
    .single()

  if (error || !data) {
    console.error('Failed to get spaces info:', error)
    // 기본값 반환
    return {
      success: true,
      data: getDefaultSpacesInfo()
    }
  }

  try {
    const parsed = JSON.parse(data.value)
    return { success: true, data: parsed }
  } catch (e) {
    console.error('Failed to parse spaces info:', e)
    return { success: true, data: getDefaultSpacesInfo() }
  }
}

export async function updateSpacesInfo(spacesInfo: SpacesInfo): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key: 'spaces_info',
      value: JSON.stringify(spacesInfo),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'key'
    })

  if (error) {
    console.error('Failed to update spaces info:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/admin/settings')
  
  return { success: true }
}

// ===== 이용 규칙 =====

export async function getGeneralRulesFromDB(): Promise<{ success: boolean; data?: GeneralRules; error?: string }> {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', 'general_rules')
    .single()

  if (error || !data) {
    console.error('Failed to get general rules:', error)
    return {
      success: true,
      data: getDefaultGeneralRules()
    }
  }

  try {
    const parsed = JSON.parse(data.value)
    return { success: true, data: parsed }
  } catch (e) {
    console.error('Failed to parse general rules:', e)
    return { success: true, data: getDefaultGeneralRules() }
  }
}

export async function updateGeneralRules(rules: GeneralRules): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('site_settings')
    .upsert({
      key: 'general_rules',
      value: JSON.stringify(rules),
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'key'
    })

  if (error) {
    console.error('Failed to update general rules:', error)
    return { success: false, error: error.message }
  }

  revalidatePath('/')
  revalidatePath('/admin/settings')
  
  return { success: true }
}

// ===== 기본값 =====

function getDefaultSpacesInfo(): SpacesInfo {
  return {
    nolter: {
      name: '놀터',
      description: '아이들이 자유롭게 놀 수 있는 공간',
      capacity: '최대 8명',
      facilities: ['장난감', '매트', '보드게임', '에어컨/난방'],
      rules: ['신발을 벗고 입장해주세요', '음식물 반입 금지', '사용 후 정리정돈', '시설물 파손 시 변상'],
      hours: '09:00 ~ 22:00',
      pricing: {
        member: '무료 (월 8시간까지)',
        nonMember: '14,000원/시간'
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
        nonMember: '14,000원/시간'
      }
    }
  }
}

function getDefaultGeneralRules(): GeneralRules {
  return {
    booking: [
      '예약은 1일 전까지 가능합니다 (당일 예약 불가)',
      '회원은 월 8시간까지 무료 이용',
      '초과 시간은 14,000원/시간',
      '비회원은 모든 이용에 14,000원/시간'
    ],
    cancellation: [
      '이용일 2일 전까지 무료 취소',
      '이용일 1일 전 취소 시 50% 환불',
      '당일 취소 시 환불 불가'
    ],
    payment: [
      '비회원 예약 후 이용일 1일 전까지 입금',
      '입금 계좌: 카카오뱅크 7979-72-56275 (정상은)',
      '예금주명과 예약자명이 다를 경우 사전 연락'
    ],
    usage: [
      '예약 시간 엄수',
      '타인에게 방해되는 행위 금지',
      '쓰레기는 되가져가기',
      '시설물 고의 파손 시 변상'
    ]
  }
}
