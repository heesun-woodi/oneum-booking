'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getMessageTemplates, toggleTemplateActive } from '@/app/actions/admin-templates'

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'signup', label: '회원가입' },
  { key: 'booking', label: '예약' },
  { key: 'payment', label: '입금' },
  { key: 'reminder', label: '리마인더' },
  { key: 'finance', label: '재무' },
  { key: 'admin', label: '관리자' },
]

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

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { 
    loadTemplates() 
  }, [category])

  async function loadTemplates() {
    setLoading(true)
    setError(null)
    
    const result = await getMessageTemplates(category === 'all' ? undefined : category)
    
    if (result.success && result.data) {
      setTemplates(result.data as MessageTemplate[])
    } else {
      setError(result.error || '템플릿 로딩 실패')
    }
    
    setLoading(false)
  }

  async function handleToggle(id: string, currentActive: boolean) {
    const result = await toggleTemplateActive(id, !currentActive)
    
    if (result.success) {
      loadTemplates()
    } else {
      alert('토글 실패: ' + result.error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">로딩 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">📝 메시지 템플릿 관리</h1>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* 카테고리 탭 */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              category === cat.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 템플릿 테이블 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {templates.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            템플릿이 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    코드
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    이름
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    제목
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ⚡ 발송 시점
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    활성화
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    액션
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono text-sm text-gray-900">{t.type_code}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{t.name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-gray-600">{t.title}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-purple-50 text-purple-700 rounded-full border border-purple-200">
                        <span>⚡</span>
                        <span>{t.trigger_info || '미정의'}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => handleToggle(t.id, t.is_active)}
                        className="inline-flex items-center justify-center w-8 h-8 rounded hover:bg-gray-100 transition-colors"
                        title={t.is_active ? '활성화됨 (클릭하여 비활성화)' : '비활성화됨 (클릭하여 활성화)'}
                      >
                        {t.is_active 
                          ? <span className="text-xl">✅</span>
                          : <span className="text-xl">⬜</span>
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Link
                        href={`/admin/templates/${t.id}`}
                        className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                      >
                        편집
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 총 개수 표시 */}
      <div className="text-sm text-gray-500">
        총 {templates.length}개 템플릿
      </div>
    </div>
  )
}
