'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createInquiry, getInquiries } from '@/app/actions/inquiries'

interface UserSession {
  isLoggedIn: boolean
  name: string
  phone: string
  userId?: string
}

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

export default function InquiryPage() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '', content: '' })
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    // localStorage에서 세션 읽기
    try {
      const raw = localStorage.getItem('userSession') || localStorage.getItem('oneumSession')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed.isLoggedIn || parsed.name) {
          const s: UserSession = {
            isLoggedIn: true,
            name: parsed.name || '',
            phone: parsed.phone || '',
            userId: parsed.id || parsed.userId,
          }
          setSession(s)
          setForm(f => ({ ...f, name: s.name, phone: s.phone }))
        }
      }
    } catch {
      // ignore
    }

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.phone.trim() || !form.content.trim()) {
      setMessage({ type: 'error', text: '모든 항목을 입력해주세요.' })
      return
    }
    setSubmitting(true)
    setMessage(null)
    const result = await createInquiry({
      name: form.name,
      phone: form.phone,
      content: form.content,
      userId: session?.userId,
    })
    setSubmitting(false)
    if (result.success) {
      setMessage({ type: 'success', text: '문의가 접수되었습니다. 빠르게 답변 드리겠습니다!' })
      setForm(f => ({ ...f, content: '' }))
      setFormOpen(false)
      loadInquiries()
    } else {
      setMessage({ type: 'error', text: result.error || '문의 접수 중 오류가 발생했습니다.' })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-800">문의 게시판</h1>
          <Link href="/" className="text-sm text-gray-500 hover:text-gray-700">
            ← 홈으로
          </Link>
        </div>

        {/* 안내 메시지 */}
        {message && (
          <div
            className={`mb-4 p-4 rounded-lg text-sm ${
              message.type === 'success'
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* 문의 작성 폼 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 mb-6">
          <button
            onClick={() => setFormOpen(!formOpen)}
            className="w-full flex items-center justify-between px-5 py-4 text-left"
          >
            <span className="font-medium text-gray-700">✏️ 문의 작성하기</span>
            <span className="text-gray-400 text-lg">{formOpen ? '▲' : '▼'}</span>
          </button>

          {formOpen && (
            <form onSubmit={handleSubmit} className="px-5 pb-5 space-y-4 border-t border-gray-100">
              <div className="pt-4 grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">이름</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    readOnly={!!session?.isLoggedIn}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      session?.isLoggedIn ? 'bg-gray-50 text-gray-500' : ''
                    }`}
                    placeholder="이름을 입력하세요"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">전화번호</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    readOnly={!!session?.isLoggedIn}
                    className={`w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 ${
                      session?.isLoggedIn ? 'bg-gray-50 text-gray-500' : ''
                    }`}
                    placeholder="010-0000-0000"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">문의 내용</label>
                <textarea
                  value={form.content}
                  onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                  rows={5}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                  placeholder="문의 내용을 입력해주세요"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {submitting ? '접수 중...' : '문의 제출'}
              </button>
            </form>
          )}
        </div>

        {/* 문의 목록 */}
        <div className="space-y-4">
          {loading ? (
            <p className="text-center text-gray-400 py-8">불러오는 중...</p>
          ) : inquiries.length === 0 ? (
            <p className="text-center text-gray-400 py-8">아직 문의가 없습니다.</p>
          ) : (
            inquiries.map(inquiry => (
              <div key={inquiry.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <span className="font-medium text-gray-800">{inquiry.name}</span>
                    <span className="text-gray-400 text-sm ml-2">{maskPhone(inquiry.phone)}</span>
                  </div>
                  <span className="text-xs text-gray-400">{formatDate(inquiry.created_at)}</span>
                </div>
                <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{inquiry.content}</p>

                {inquiry.answer ? (
                  <div className="mt-4 p-4 bg-blue-50 border border-blue-100 rounded-lg">
                    <p className="text-xs font-semibold text-blue-600 mb-1">
                      답변 {inquiry.answered_at ? `· ${formatDate(inquiry.answered_at)}` : ''}
                    </p>
                    <p className="text-sm text-blue-800 whitespace-pre-wrap leading-relaxed">{inquiry.answer}</p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <span className="inline-block text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      답변 대기중
                    </span>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
