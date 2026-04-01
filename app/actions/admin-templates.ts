'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi'

// ===== 타입 정의 =====
export interface MessageTemplate {
  id: string
  type_code: string
  category: string
  name: string
  title: string
  content: string
  is_active: boolean
  variables: string[]
  trigger_info?: string  // 발송 시점 (예: "회원가입 승인 시", "예약 완료 직후")
  created_at: string
  updated_at: string
}

interface ActionResult<T = any> {
  success: boolean
  error?: string
  data?: T
}

// ===== 조회 함수 =====

/**
 * 템플릿 목록 조회
 * @param category - 카테고리 필터 (선택)
 */
export async function getMessageTemplates(
  category?: string
): Promise<ActionResult<MessageTemplate[]>> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('message_templates')
      .select('*')
      .order('type_code')
    
    if (category) {
      query = query.eq('category', category)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error('Get templates error:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('Get templates error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 특정 템플릿 조회 (type_code 기준)
 */
export async function getTemplateByCode(
  typeCode: string
): Promise<ActionResult<MessageTemplate>> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('type_code', typeCode)
      .single()
    
    if (error) {
      console.error('Get template by code error:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, data }
  } catch (error: any) {
    console.error('Get template by code error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 특정 템플릿 조회 (ID 기준)
 */
export async function getTemplateById(
  id: string
): Promise<ActionResult<MessageTemplate>> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', id)
      .single()
    
    if (error) {
      console.error('Get template by id error:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, data }
  } catch (error: any) {
    console.error('Get template by id error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 런타임용: 활성화된 템플릿 조회 (발송 로직에서 사용)
 */
export async function getActiveTemplate(
  typeCode: string
): Promise<MessageTemplate | null> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('message_templates')
      .select('*')
      .eq('type_code', typeCode)
      .eq('is_active', true)
      .single()
    
    if (error || !data) {
      console.warn(`Active template not found: ${typeCode}`)
      return null
    }
    
    return data
  } catch (error: any) {
    console.error('Get active template error:', error)
    return null
  }
}

// ===== 생성 함수 =====

/**
 * 새 템플릿 생성
 */
export async function createTemplate(template: {
  type_code: string
  category: string
  name: string
  title: string
  content: string
  variables: string[]
}): Promise<ActionResult<MessageTemplate>> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('message_templates')
      .insert(template)
      .select()
      .single()
    
    if (error) {
      console.error('Create template error:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true, data }
  } catch (error: any) {
    console.error('Create template error:', error)
    return { success: false, error: error.message }
  }
}

// ===== 수정 함수 =====

/**
 * 템플릿 수정
 */
export async function updateTemplate(
  id: string,
  updates: Partial<{
    name: string
    title: string
    content: string
    is_active: boolean
    variables: string[]
  }>
): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('message_templates')
      .update(updates)
      .eq('id', id)
    
    if (error) {
      console.error('Update template error:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (error: any) {
    console.error('Update template error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 템플릿 활성화 토글
 */
export async function toggleTemplateActive(
  id: string,
  isActive: boolean
): Promise<ActionResult> {
  return updateTemplate(id, { is_active: isActive })
}

// ===== 삭제 함수 =====

/**
 * 템플릿 삭제 (주의: 기존 시스템에서 사용 중인 템플릿은 삭제하지 말 것)
 */
export async function deleteTemplate(id: string): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('message_templates')
      .delete()
      .eq('id', id)
    
    if (error) {
      console.error('Delete template error:', error)
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (error: any) {
    console.error('Delete template error:', error)
    return { success: false, error: error.message }
  }
}

// ===== 테스트 발송 =====

/**
 * 템플릿 테스트 발송
 * @param templateId - 템플릿 ID
 * @param testPhone - 수신 전화번호
 * @param testVariables - 테스트용 변수 값
 */
export async function sendTestMessage(
  templateId: string,
  testPhone: string,
  testVariables: Record<string, string>
): Promise<ActionResult<{ messageId?: string; preview: string }>> {
  try {
    // 1. 템플릿 조회
    const result = await getTemplateById(templateId)
    
    if (!result.success || !result.data) {
      return { success: false, error: '템플릿을 찾을 수 없습니다' }
    }
    
    const template = result.data
    
    // 2. 변수 치환
    let message = template.content
    for (const [key, value] of Object.entries(testVariables)) {
      message = message.replaceAll(`{${key}}`, value || '')
    }
    
    // 3. 전화번호 정리
    const cleanPhone = testPhone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 10) {
      return { success: false, error: '올바른 전화번호를 입력하세요' }
    }
    
    // 4. Solapi 발송
    const sendResult = await sendSMS({
      to: cleanPhone,
      text: message,
    })
    
    if (!sendResult.success) {
      return { 
        success: false, 
        error: sendResult.error || '발송 실패',
        data: { preview: message }
      }
    }
    
    return { 
      success: true, 
      data: {
        messageId: sendResult.msgId,
        preview: message
      }
    }
  } catch (error: any) {
    console.error('Send test message error:', error)
    return { success: false, error: error.message }
  }
}

// ===== 헬퍼 함수 =====

/**
 * 템플릿 변수 추출 (content에서 {변수} 형식 파싱)
 */
export async function extractVariables(content: string): Promise<string[]> {
  const regex = /\{([a-zA-Z0-9_]+)\}/g
  const variables = new Set<string>()
  
  let match
  while ((match = regex.exec(content)) !== null) {
    variables.add(match[1])
  }
  
  return Array.from(variables)
}
