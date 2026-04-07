'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getMessageTemplates, updateTemplate, sendTestMessage, extractVariables } from '@/app/actions/admin-templates'

interface MessageTemplate {
  id: string
  type_code: string
  category: string
  name: string
  title: string
  content: string
  is_active: boolean
  variables: string[]
  trigger_info?: string
  created_at: string
  updated_at: string
}

export default function EditTemplatePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [template, setTemplate] = useState<MessageTemplate | null>(null)
  const [form, setForm] = useState({ title: '', content: '' })
  const [testPhone, setTestPhone] = useState('')
  const [testVars, setTestVars] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => { 
    loadTemplate() 
  }, [params.id])

  // 실시간 미리보기 업데이트
  useEffect(() => {
    setPreview(getPreview())
  }, [form.content, testVars])

  async function loadTemplate() {
    setLoading(true)
    
    // Note: getMessageTemplates로 전체를 가져온 후 id로 필터링
    // 실제로는 getTemplateById를 만들어야 하지만 Day 1에서 구현됨
    const result = await getMessageTemplates()
    
    if (result.success && result.data) {
      const found = result.data.find((t: MessageTemplate) => t.id === params.id)
      
      if (found) {
        setTemplate(found)
        setForm({ title: found.title, content: found.content })
        
        // 변수 기본값 설정 (DB에 없으면 content에서 직접 추출)
        const vars: Record<string, string> = {}
        const varNames = (found.variables?.length > 0)
          ? found.variables
          : await extractVariables(found.content)
        varNames.forEach((v: string) => { vars[v] = '' })
        setTestVars(vars)
      } else {
        alert('템플릿을 찾을 수 없습니다')
        router.push('/admin/templates')
      }
    } else {
      alert('템플릿 로딩 실패: ' + result.error)
      router.push('/admin/templates')
    }
    
    setLoading(false)
  }

  async function handleSave() {
    if (!form.title.trim()) {
      alert('제목을 입력하세요')
      return
    }
    
    if (!form.content.trim()) {
      alert('내용을 입력하세요')
      return
    }
    
    setSaving(true)
    
    const variables = await extractVariables(form.content)
    const result = await updateTemplate(params.id, { ...form, variables })
    
    if (result.success) {
      alert('저장되었습니다')
    } else {
      alert('저장 실패: ' + result.error)
    }
    
    setSaving(false)
  }

  async function handleTestSend() {
    if (!testPhone) {
      alert('전화번호를 입력하세요')
      return
    }

    setSending(true)

    const result = await sendTestMessage(params.id, testPhone)
    
    if (result.success) {
      alert('테스트 발송 완료!')
      setPreview(result.data?.preview || '')
    } else {
      alert('발송 실패: ' + result.error)
    }
    
    setSending(false)
  }

  // 실시간 미리보기 생성
  function getPreview() {
    let msg = form.content
    Object.entries(testVars).forEach(([k, v]) => {
      // 값이 있으면 치환, 없으면 변수 그대로 표시
      msg = msg.replaceAll(`{${k}}`, v || `{${k}}`)
    })
    return msg
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  if (!template) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">템플릿을 찾을 수 없습니다</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">✏️ 템플릿 편집: {template.name}</h1>
        <button
          onClick={() => router.push('/admin/templates')}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← 목록으로
        </button>
      </div>
      
      {/* 기본 정보 + 편집 폼 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">코드</label>
            <p className="font-mono text-lg text-gray-900">{template.type_code}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">카테고리</label>
            <p className="text-lg text-gray-900">{template.category}</p>
          </div>
        </div>
        
        {/* 발송 시점 (트리거) */}
        {template.trigger_info && (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-purple-600 text-xl">⚡</span>
              <div>
                <p className="text-sm font-medium text-purple-900">발송 시점</p>
                <p className="text-sm text-purple-700 mt-0.5">{template.trigger_info}</p>
              </div>
            </div>
          </div>
        )}
        
        <div className="mb-6 pb-6 border-b border-gray-200"></div>
        
        <div className="space-y-4">
          {/* 제목 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              제목 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              placeholder="[온음] 예약 완료"
            />
          </div>
          
          {/* 내용 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              내용 <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="메시지 내용을 입력하세요..."
            />
            <p className="text-xs text-gray-500 mt-2">
              💡 <strong>사용 가능한 변수:</strong>{' '}
              {template.variables && template.variables.length > 0
                ? template.variables.map((v: string) => `{${v}}`).join(', ')
                : '없음'}
            </p>
          </div>
          
          {/* 저장 버튼 */}
          <div className="flex justify-end pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {saving ? '저장 중...' : '💾 저장'}
            </button>
          </div>
        </div>
      </div>

      {/* 테스트 발송 섹션 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">🧪 테스트 발송</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* 좌측: 변수 입력 */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                수신 번호 <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 mt-1">
                하이픈(-) 없이 숫자만 입력
              </p>
            </div>
            
            {template.variables && template.variables.length > 0 && (
              <p className="text-xs text-gray-500">
                💡 변수({template.variables.map((v: string) => `{${v}}`).join(', ')})는 실제 DB 데이터로 자동 적용됩니다
              </p>
            )}
            
            <button
              onClick={handleTestSend}
              disabled={sending}
              className="w-full px-4 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              {sending ? '발송 중...' : '📤 테스트 발송'}
            </button>
          </div>
          
          {/* 우측: 미리보기 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              실시간 미리보기
            </label>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm h-80 overflow-auto">
              {preview || form.content || '템플릿 내용이 여기에 표시됩니다.'}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              💡 테스트 발송 후 실제 적용된 메시지가 표시됩니다
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

// 변수별 예시 값 제공
function getExampleValue(variable: string): string {
  const examples: Record<string, string> = {
    name: '홍길동',
    household: '101',
    date: '2026-04-01',
    time: '14:00-16:00',
    space: '온음 스튜디오',
    amount: '50000',
    account: '카카오뱅크 1234-56-7890',
    deadline: '2026-03-31',
    reason: '승인 조건 미충족',
    phone: '010-1234-5678',
    count: '3',
    list: '홍길동, 김영희, 이철수',
    adminUrl: 'https://...',
  }
  
  return examples[variable] || '값'
}
