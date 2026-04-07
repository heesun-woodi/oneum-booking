'use client'

import { useState, useEffect } from 'react'
import { getInquiries, answerInquiry, deleteInquiry } from '@/app/actions/inquiries'

interface Inquiry {
  id: string
  name: string
  phone: string
  content: string
  answer: string | null
  answered_at: string | null
  created_at: string
}

function maskPhone(phone: string): string {
  const n = phone.replace(/[^0-9]/g, '')
  if (n.length === 11) return n.replace(/(\d{3})(\d{4})(\d{4})/, '$1-****-$3')
  return phone
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })
}

export default function AdminInquiryPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    loadInquiries()
  }, [])

  async function loadInquiries() {
    setLoading(true)
    const result = await getInquiries()
    if (result.success) {
      setInquiries(result.data as Inquiry[])
    }
    setLoading(false)
  }

  async function handleSaveAnswer(inquiryId: string) {
    const answer = answerDrafts[inquiryId]?.trim()
    if (!answer) return
    setSaving(inquiryId)
    const result = await answerInquiry(inquiryId, answer)
    setSaving(null)
    if (result.success) {
      setEditingId(null)
      setAnswerDrafts(d => { const next = { ...d }; delete next[inquiryId]; return next })
      loadInquiries()
    } else {
      alert('답변 저장에 실패했습니다.')
    }
  }

  async function handleDelete(inquiryId: string) {
    if (!confirm('문의를 삭제하시겠습니까?')) return
    const result = await deleteInquiry(inquiryId)
    if (result.success) {
      loadInquiries()
    } else {
      alert('삭제에 실패했습니다.')
    }
  }

  function startEdit(inquiry: Inquiry) {
    setEditingId(inquiry.id)
    setAnswerDrafts(d => ({ ...d, [inquiry.id]: inquiry.answer || '' }))
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">문의 관리</h1>
        <span className="text-sm text-gray-500">총 {inquiries.length}건</span>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-12">불러오는 중...</p>
      ) : inquiries.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center text-gray-400">
          접수된 문의가 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {inquiries.map(inquiry => (
            <div key={inquiry.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              {/* 카드 헤더 */}
              <div className="flex items-start justify-between mb-3">
                <div>
                  <span className="font-medium text-gray-800">{inquiry.name}</span>
                  <span className="text-gray-400 text-sm ml-2">{maskPhone(inquiry.phone)}</span>
                  <span className="text-gray-400 text-xs ml-2">{formatDate(inquiry.created_at)}</span>
                </div>
                <button
                  onClick={() => handleDelete(inquiry.id)}
                  className="text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded hover:bg-red-50"
                >
                  삭제
                </button>
              </div>

              {/* 문의 내용 */}
              <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed border-b border-gray-100 pb-3 mb-3">
                {inquiry.content}
              </p>

              {/* 답변 영역 */}
              {editingId === inquiry.id ? (
                <div className="space-y-2">
                  <textarea
                    value={answerDrafts[inquiry.id] || ''}
                    onChange={e => setAnswerDrafts(d => ({ ...d, [inquiry.id]: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                    placeholder="답변을 입력하세요"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveAnswer(inquiry.id)}
                      disabled={saving === inquiry.id}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving === inquiry.id ? '저장 중...' : '답변 저장'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-4 py-2 bg-gray-100 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-200"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : inquiry.answer ? (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-xs font-semibold text-blue-600">
                      답변 완료 {inquiry.answered_at ? `· ${formatDate(inquiry.answered_at)}` : ''}
                    </p>
                    <button
                      onClick={() => startEdit(inquiry)}
                      className="text-xs text-blue-500 hover:text-blue-700"
                    >
                      답변 수정
                    </button>
                  </div>
                  <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">{inquiry.answer}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    value={answerDrafts[inquiry.id] || ''}
                    onChange={e => setAnswerDrafts(d => ({ ...d, [inquiry.id]: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                    placeholder="답변을 입력하세요"
                  />
                  <button
                    onClick={() => handleSaveAnswer(inquiry.id)}
                    disabled={saving === inquiry.id}
                    className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving === inquiry.id ? '저장 중...' : '답변 저장'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
