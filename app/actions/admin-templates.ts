'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { sendSMS, sendAuto } from '@/lib/solapi'

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
  trigger_info?: string
  is_active?: boolean
  variables: string[]
}): Promise<ActionResult<MessageTemplate>> {
  try {
    const supabase = await createClient()
    
    // 1. type_code 형식 검증
    const typeCodeRegex = /^\d+-\d+$/
    if (!typeCodeRegex.test(template.type_code)) {
      return { 
        success: false, 
        error: 'type_code 형식이 올바르지 않습니다 (예: 7-1)' 
      }
    }
    
    // 2. 중복 type_code 체크
    const { data: existing } = await supabase
      .from('message_templates')
      .select('id')
      .eq('type_code', template.type_code)
      .single()
    
    if (existing) {
      return { 
        success: false, 
        error: `이미 존재하는 type_code입니다: ${template.type_code}` 
      }
    }
    
    // 3. 필수 필드 검증
    if (!template.name.trim()) {
      return { success: false, error: '이름을 입력하세요' }
    }
    
    if (!template.title.trim()) {
      return { success: false, error: '제목을 입력하세요' }
    }
    
    if (!template.content.trim()) {
      return { success: false, error: '내용을 입력하세요' }
    }
    
    // 4. 템플릿 생성
    const payload = {
      ...template,
      is_active: template.is_active ?? false,
    }
    
    const { data, error } = await supabase
      .from('message_templates')
      .insert(payload)
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
 * 템플릿 타입별 실제 DB 데이터로 변수 자동 생성
 */
async function getAutoTestVariables(typeCode: string): Promise<Record<string, string>> {
  const supabase = await createServiceRoleClient()
  const vars: Record<string, string> = {}

  const korDate = (d: string) =>
    new Date(d).toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })
  const adminUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/payments`
    : 'https://oneum.vercel.app/admin/payments'

  // 예약 관련 템플릿
  if (['2-1','2-2','2-3','3-1','3-2','4-1','4-2','4-3'].includes(typeCode)) {
    const { data: b } = await supabase
      .from('bookings').select('*')
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()

    if (b) {
      const deadline = new Date(b.booking_date)
      deadline.setDate(deadline.getDate() - 1)
      vars.name     = b.name || '홍길동'
      vars.household = b.household || '101호'
      vars.date     = korDate(b.booking_date)
      vars.time     = `${b.start_time} ~ ${b.end_time}`
      vars.space    = b.space === 'nolter' ? '놀터' : '방음실'
      vars.amount   = (b.amount || 0).toLocaleString()
      vars.account  = process.env.BANK_ACCOUNT || '계좌정보없음'
      vars.deadline = korDate(deadline.toISOString().split('T')[0])
      vars.season   = '봄'
    }
  }

  // 미입금 예약 알림 (5-2)
  if (typeCode === '5-2') {
    const today = new Date().toISOString().split('T')[0]
    const { data: bookings } = await supabase
      .from('bookings').select('*')
      .eq('payment_status', 'pending').eq('status', 'pending')
      .gt('amount', 0).gte('booking_date', today).limit(5)

    const list = (bookings || [])
      .map(b => `${b.name}${b.household ? ` (${b.household})` : ''} - ${korDate(b.booking_date)} ${b.start_time}~${b.end_time} (${b.space === 'nolter' ? '놀터' : '방음실'}) ${b.amount.toLocaleString()}원`)
      .join('\n')

    vars.count    = (bookings?.length || 0).toString()
    vars.list     = list || '(미입금 예약 없음)'
    vars.adminUrl = adminUrl
  }

  // 가입 승인/거부 (1-2, 1-3)
  if (['1-2','1-3'].includes(typeCode)) {
    const { data: u } = await supabase
      .from('users').select('*')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    vars.name      = u?.name || '홍길동'
    vars.household = u?.household || '101호'
    vars.reason    = '가입 요건 미충족 (테스트)'
  }

  // 환불 안내 (5-3)
  if (typeCode === '5-3') {
    const { data: b } = await supabase
      .from('bookings').select('*')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    vars.name   = b?.name || '홍길동'
    vars.phone  = b?.phone || '01012345678'
    vars.amount = (b?.amount || 0).toLocaleString()
    vars.date   = b ? korDate(b.booking_date) : korDate(new Date().toISOString())
  }

  // 회원가입 신청 알림 (6-1)
  if (typeCode === '6-1') {
    const { data: u } = await supabase
      .from('users').select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    vars.name      = u?.name || '홍길동'
    vars.household = u?.household || '101호'
    vars.phone     = u?.phone || '01012345678'
    vars.adminUrl  = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/admin`
      : 'https://oneum.vercel.app/admin'
  }

  // 선불권 관련 (7-1, 7-2, 7-3)
  if (['7-1', '7-2', '7-3'].includes(typeCode)) {
    const { data: u } = await supabase
      .from('users').select('*')
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle()
    const { data: p } = await supabase
      .from('prepaid_products').select('*')
      .eq('is_active', true)
      .limit(1).maybeSingle()
    const deadline = new Date()
    deadline.setHours(deadline.getHours() + 48)
    const deadlineStr = deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    const adminPrepaidUrl = process.env.NEXT_PUBLIC_APP_URL
      ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/prepaid`
      : 'https://oneum.vercel.app/admin/prepaid'
    // 7-1, 7-3 변수
    vars.name        = u?.name || '홍길동'
    vars.household   = u?.household || '101호'
    vars.phone       = u?.phone || '01012345678'
    vars.productName = p?.name || '10회 선불권'
    vars.amount      = (p?.price || 100000).toLocaleString()
    vars.account     = process.env.BANK_ACCOUNT || '계좌정보없음'
    vars.deadline    = deadlineStr
    vars.totalHours  = (p?.hours || 10).toString()
    vars.adminUrl    = adminPrepaidUrl
    // 7-2 전용 변수 (선불권 요약)
    vars.prepaidCount    = '1'
    vars.prepaidList     = `- ${u?.name || '홍길동'}${u?.household ? ` (${u.household}호)` : ''} / ${p?.name || '10회 선불권'} ${(p?.price || 100000).toLocaleString()}원 (마감: ${deadlineStr})`
    vars.prepaidDeadline = deadlineStr
  }

  return vars
}

/**
 * 템플릿 테스트 발송 (실제 DB 데이터로 변수 자동 생성)
 */
export async function sendTestMessage(
  templateId: string,
  testPhone: string,
): Promise<ActionResult<{ messageId?: string; preview: string }>> {
  try {
    // 1. 템플릿 조회
    const result = await getTemplateById(templateId)
    if (!result.success || !result.data) {
      return { success: false, error: '템플릿을 찾을 수 없습니다' }
    }
    const template = result.data

    // 2. 실제 DB 데이터로 변수 자동 생성
    const autoVars = await getAutoTestVariables(template.type_code)

    // 3. 변수 치환
    let message = template.content
    for (const [key, value] of Object.entries(autoVars)) {
      message = message.replaceAll(`{${key}}`, value)
    }

    // 4. 전화번호 정리
    const cleanPhone = testPhone.replace(/[^0-9]/g, '')
    if (cleanPhone.length < 10) {
      return { success: false, error: '올바른 전화번호를 입력하세요' }
    }

    // 5. 발송 (90byte 초과 시 LMS 자동 전환)
    const sendResult = await sendAuto(cleanPhone, message)

    if (!sendResult.success) {
      return { success: false, error: sendResult.error || '발송 실패', data: { preview: message } }
    }

    return { success: true, data: { messageId: sendResult.msgId, preview: message } }
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
