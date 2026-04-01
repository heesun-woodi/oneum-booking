'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createTemplate, extractVariables } from '@/app/actions/admin-templates'

const CATEGORIES = [
  { key: 'signup', label: '회원가입' },
  { key: 'booking', label: '예약' },
  { key: 'payment', label: '입금' },
  { key: 'reminder', label: '리마인더' },
  { key: 'finance', label: '재무' },
  { key: 'admin', label: '관리자' },
]

const VARIABLE_GUIDE = [
  { name: 'name', desc: '이름' },
  { name: 'household', desc: '세대명' },
  { name: 'date', desc: '날짜' },
  { name: 'time', desc: '시간' },
  { name: 'space', desc: '공간' },
  { name: 'amount', desc: '금액' },
  { name: 'account', desc: '계좌번호' },
  { name: 'deadline', desc: '기한' },
]

export default function NewTemplatePage() {
  const router = useRouter()
  const [form, setForm] = useState({
    type_code: '',
    category: 'booking',
    name: '',
    title: '',
    content: '',
    trigger_info: '',
    is_active: false,
  })
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState('')

  // type_code 형식 검증
  function validateTypeCode(code: string): boolean {
    const regex = /^\d+-\d+$/
    return regex.test(code)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // 1. 필수 필드 체크
    if (!form.type_code.trim()) {
      alert('코드를 입력하세요')
      return
    }

    if (!validateTypeCode(form.type_code)) {
      alert('코드 형식이 올바르지 않습니다 (예: 7-1)')
      return
    }

    if (!form.category) {
      alert('카테고리를 선택하세요')
      return
    }

    if (!form.name.trim()) {
      alert('이름을 입력하세요')
      return
    }

    if (!form.title.trim()) {
      alert('제목을 입력하세요')
      return
    }

    if (!form.content.trim()) {
      alert('내용을 입력하세요')
      return
    }

    // 2. 변수 추출
    const variables = await extractVariables(form.content)

    // 3. 템플릿 생성
    setSaving(true)

    const payload = {
      type_code: form.type_code,
      category: form.category,
      name: form.name,
      title: form.title,
      content: form.content,
      trigger_info: form.trigger_info || undefined,
      is_active: form.is_active,
      variables,
    }

    const result = await createTemplate(payload)

    if (result.success) {
      alert('템플릿이 생성되었습니다')
      router.push('/admin/templates')
    } else {
      alert('생성 실패: ' + result.error)
      setSaving(false)
    }
  }

  // 실시간 미리보기 (변수를 강조 표시)
  function updatePreview() {
    let msg = form.content
    VARIABLE_GUIDE.forEach(({ name }) => {
      msg = msg.replaceAll(`{${name}}`, `[${name.toUpperCase()}]`)
    })
    setPreview(msg)
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">➕ 새 템플릿 추가</h1>
        <button
          onClick={() => router.push('/admin/templates')}
          className="text-gray-600 hover:text-gray-900 text-sm"
        >
          ← 목록으로
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 기본 정보 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">기본 정보</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* type_code */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                코드 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.type_code}
                onChange={(e) => setForm({ ...form, type_code: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                placeholder="예: 7-1"
                required
              />
              <p className="text-xs text-gray-500 mt-1">형식: 숫자-숫자 (예: 7-1)</p>
            </div>

            {/* category */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                카테고리 <span className="text-red-500">*</span>
              </label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.key} value={cat.key}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                이름 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="예: 예약 완료"
                required
              />
            </div>

            {/* trigger_info */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                발송 시점
              </label>
              <input
                type="text"
                value={form.trigger_info}
                onChange={(e) => setForm({ ...form, trigger_info: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="예: 예약 완료 직후"
              />
              <p className="text-xs text-gray-500 mt-1">발송 타이밍 설명 (선택)</p>
            </div>
          </div>

          {/* is_active */}
          <div className="mt-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                className="w-4 h-4 text-blue-500 rounded focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">활성화</span>
              <span className="text-xs text-gray-500">(생성 후 바로 사용 가능하게 하려면 체크)</span>
            </label>
          </div>
        </div>

        {/* 메시지 내용 */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">메시지 내용</h2>

          <div className="space-y-4">
            {/* title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                제목 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="[온음] 예약 완료"
                required
              />
            </div>

            {/* content */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                내용 <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.content}
                onChange={(e) => {
                  setForm({ ...form, content: e.target.value })
                  updatePreview()
                }}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="메시지 내용을 입력하세요...&#10;&#10;예:&#10;{name}님, 예약이 완료되었습니다.&#10;날짜: {date}&#10;시간: {time}"
                required
              />
            </div>
          </div>
        </div>

        {/* 변수 가이드 */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">💡 사용 가능한 변수</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {VARIABLE_GUIDE.map(({ name, desc }) => (
              <div key={name} className="text-xs">
                <code className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {`{${name}}`}
                </code>
                <span className="text-blue-700 ml-1">- {desc}</span>
              </div>
            ))}
          </div>
          <p className="text-xs text-blue-600 mt-2">
            변수는 자동으로 추출됩니다. 위 형식대로 중괄호 안에 변수명을 입력하세요.
          </p>
        </div>

        {/* 미리보기 */}
        {preview && (
          <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
            <h3 className="text-sm font-medium text-gray-700 mb-2">미리보기</h3>
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 whitespace-pre-wrap text-sm">
              {preview}
            </div>
          </div>
        )}

        {/* 저장 버튼 */}
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.push('/admin/templates')}
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {saving ? '생성 중...' : '✅ 생성'}
          </button>
        </div>
      </form>
    </div>
  )
}
