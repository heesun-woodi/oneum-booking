'use client'

import { useState, useEffect } from 'react'
import {
  getAdminBookings,
  cancelBookingAdmin,
  createBookingAdmin,
  previewAdminBooking,
  searchBookingUsers,
} from '@/app/actions/admin-bookings'

/** 운영 시간 09:00~21:30 의 30분 슬롯 (app/page.tsx 와 동일) */
const START_SLOTS: string[] = []
for (let h = 9; h <= 21; h++) {
  START_SLOTS.push(`${String(h).padStart(2, '0')}:00`)
  if (h < 21) START_SLOTS.push(`${String(h).padStart(2, '0')}:30`)
}
/** 종료 시각 후보 = 시작 슬롯을 한 칸씩 민 것 + 마지막 21:30 */
const END_SLOTS: string[] = [...START_SLOTS.slice(1), '21:30']

interface UserOption {
  id: string
  name: string
  phone: string
  household: string | null
  is_resident: boolean
}

interface Booking {
  id: string
  booking_date: string
  start_time: string
  end_time: string
  space: 'nolter' | 'soundroom'
  member_type: 'member' | 'non-member'
  household?: string
  name: string
  phone: string
  amount: number
  status: string
  payment_status: string
  created_at: string
  user_id?: string | null
  /** 마이그레이션 035 이전 행에는 없다 */
  created_by_admin?: string | null
  admin_note?: string | null
}

export default function AdminBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  
  // 필터
  const [status, setStatus] = useState('')
  const [space, setSpace] = useState('')
  const [household, setHousehold] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  // ===== 소급 등록 =====
  // 관리자 신원은 httpOnly 쿠키로만 증명된다. 여기서 id 를 들고 다니지 않는다.
  const [formOpen, setFormOpen] = useState(false)
  const [targetMode, setTargetMode] = useState<'member' | 'guest'>('member')
  const [userQuery, setUserQuery] = useState('')
  const [userResults, setUserResults] = useState<UserOption[]>([])
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null)
  const [guestName, setGuestName] = useState('')
  const [guestPhone, setGuestPhone] = useState('')
  const [formSpace, setFormSpace] = useState<'nolter' | 'soundroom'>('nolter')
  const [formDate, setFormDate] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formNote, setFormNote] = useState('')
  const [preview, setPreview] = useState<{ summary: string; amount: number; userKind: string } | null>(null)
  const [previewError, setPreviewError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // 선택한 구간에 해당하는 30분 슬롯들. 서버는 이 배열로 start/end 를 다시 계산한다.
  const formTimes =
    formStart && formEnd && formStart < formEnd
      ? START_SLOTS.filter(s => s >= formStart && s < formEnd)
      : []

  const loadBookings = async () => {
    setLoading(true)
    
    const result = await getAdminBookings({
      status: status || undefined,
      space: space || undefined,
      household: household || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      limit: 100,
    })
    
    if (result.success) {
      setBookings(result.bookings as Booking[])
      setTotal(result.total)
    }
    
    setLoading(false)
  }
  
  useEffect(() => {
    loadBookings()
  }, [status, space, household, startDate, endDate])

  // 회원 검색 (입력이 멎은 뒤에만 조회)
  useEffect(() => {
    if (targetMode !== 'member') return
    const keyword = userQuery.trim()
    if (!keyword) {
      setUserResults([])
      return
    }

    const timer = setTimeout(async () => {
      const result = await searchBookingUsers(keyword)
      if (result.success) setUserResults(result.users as UserOption[])
    }, 250)

    return () => clearTimeout(timer)
  }, [userQuery, targetMode])

  // 과금 미리보기. 실제 등록과 같은 계산을 서버에서 돌려 받는다.
  useEffect(() => {
    if (!formOpen || !formDate || formTimes.length === 0) {
      setPreview(null)
      setPreviewError('')
      return
    }
    // 비회원은 무료·선불권이 없어 미리보기가 항상 현금이지만, 금액 확인을 위해 그대로 조회한다.
    if (targetMode === 'member' && !selectedUser) {
      setPreview(null)
      setPreviewError('')
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      const result = await previewAdminBooking({
        bookingDate: formDate,
        times: formTimes,
        space: formSpace,
        userId: targetMode === 'member' ? selectedUser?.id : undefined,
      })
      if (cancelled) return

      if (result.success) {
        setPreview({
          summary: result.summary!,
          amount: result.charge!.amount,
          userKind: result.userKind!,
        })
        setPreviewError('')
      } else {
        setPreview(null)
        setPreviewError(result.error ?? '미리보기를 계산할 수 없습니다.')
      }
    }, 200)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // formTimes 는 매 렌더 새 배열이라 의존성에 넣지 않고, 그 원천인 start/end 를 본다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formOpen, formDate, formStart, formEnd, formSpace, targetMode, selectedUser])

  const resetForm = () => {
    setTargetMode('member')
    setUserQuery('')
    setUserResults([])
    setSelectedUser(null)
    setGuestName('')
    setGuestPhone('')
    setFormSpace('nolter')
    setFormDate('')
    setFormStart('')
    setFormEnd('')
    setFormNote('')
    setPreview(null)
    setPreviewError('')
  }

  const handleCreateRetroactive = async () => {
    if (submitting) return

    if (!formDate) return alert('사용 날짜를 선택해주세요.')
    if (formTimes.length === 0) return alert('시작·종료 시각을 올바르게 선택해주세요.')
    if (targetMode === 'member' && !selectedUser) return alert('회원을 검색해 선택해주세요.')
    if (targetMode === 'guest') {
      if (!guestName.trim()) return alert('이름을 입력해주세요.')
      if (!guestPhone.trim()) return alert('전화번호를 입력해주세요.')
    }

    const who = targetMode === 'member' ? selectedUser!.name : guestName.trim()
    const spaceName = formSpace === 'nolter' ? '놀터' : '방음실'
    const chargeLine = preview ? `\n과금: ${preview.summary}` : ''
    // 유료로 남는 건은 자동 입금안내·자동취소 대상이 아니므로 수금이 수동이라는 점을 알린다.
    const unpaidLine =
      preview && preview.amount > 0
        ? `\n\n※ ${preview.amount.toLocaleString()}원이 미입금(pending)으로 남습니다.\n` +
          `자동 입금안내와 자동취소 대상이 아니므로 수금은 직접 확인해주세요.`
        : ''
    if (
      !confirm(
        `아래 내용으로 소급 등록합니다.\n\n` +
          `${who} / ${spaceName}\n${formDate} ${formStart}~${formEnd}${chargeLine}${unpaidLine}\n\n` +
          `선불권이 차감되며 예약 확정 문자는 발송되지 않습니다. 진행할까요?`
      )
    ) {
      return
    }

    setSubmitting(true)
    const result = await createBookingAdmin({
      bookingDate: formDate,
      times: formTimes,
      space: formSpace,
      userId: targetMode === 'member' ? selectedUser!.id : undefined,
      name: targetMode === 'guest' ? guestName.trim() : undefined,
      phone: targetMode === 'guest' ? guestPhone.trim() : undefined,
      note: formNote,
    })
    setSubmitting(false)

    if (result.success) {
      alert(`소급 등록이 완료되었습니다.\n${result.summary}`)
      resetForm()
      setFormOpen(false)
      loadBookings()
    } else {
      alert(`등록 실패: ${result.error}`)
    }
  }

  const handleCancelBooking = async (bookingId: string, booking: Booking) => {
    const spaceName = booking.space === 'nolter' ? '놀터' : '방음실'
    if (!confirm(`${booking.booking_date} ${booking.start_time}~${booking.end_time} ${spaceName} 예약을 취소하시겠습니까?`)) return
    
    const reason = prompt('취소 사유를 입력해주세요 (선택, 없으면 비우고 확인)')
    if (reason === null) return  // 사유 창에서 취소 클릭 시 전체 취소 중단

    const result = await cancelBookingAdmin(bookingId, reason || undefined)
    
    if (result.success) {
      alert('예약이 취소되었습니다.')
      loadBookings()
    } else {
      alert(`취소 실패: ${result.error}`)
    }
  }
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded">확정</span>
      case 'pending':
        return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded">대기</span>
      case 'cancelled':
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">취소</span>
      default:
        return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">{status}</span>
    }
  }
  
  const getSpaceName = (space: string) => {
    return space === 'nolter' ? '놀터' : '방음실'
  }
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  }
  
  const formatPhone = (phone: string) => {
    return phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')
  }
  
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">📅 예약 관리</h1>
        <div className="flex items-center gap-4">
          <p className="text-sm text-gray-500">총 {total}건</p>
          <button
            onClick={() => {
              if (formOpen) resetForm()
              setFormOpen(!formOpen)
            }}
            className={`px-3 py-2 rounded-md text-sm font-medium ${
              formOpen
                ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {formOpen ? '닫기' : '➕ 소급 등록'}
          </button>
        </div>
      </div>

      {/* 소급 등록: 예약 없이 사용한 건을 사후 기록한다 */}
      {formOpen && (
        <div className="bg-white p-5 rounded-lg shadow-sm border border-blue-200">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-gray-800">➕ 소급 등록</h2>
            <p className="mt-1 text-xs text-gray-500">
              예약 없이 사용한 건을 사후에 기록합니다. 과금은 일반 예약과 동일하게
              무료시간 → 선불권 → 현금 순으로 계산되며, <strong>예약 확정 문자는 발송되지 않습니다.</strong>
            </p>
          </div>

          {/* 대상 */}
          <div className="mb-4">
            <label className="block text-xs text-gray-600 mb-2">이용자</label>
            <div className="flex gap-2 mb-3">
              {(['member', 'guest'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => {
                    setTargetMode(mode)
                    setSelectedUser(null)
                    setUserQuery('')
                    setUserResults([])
                  }}
                  className={`px-3 py-1.5 rounded-md text-sm border ${
                    targetMode === mode
                      ? 'bg-blue-50 border-blue-400 text-blue-700 font-medium'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {mode === 'member' ? '회원' : '비회원'}
                </button>
              ))}
            </div>

            {targetMode === 'member' ? (
              selectedUser ? (
                <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-200 rounded-md">
                  <span className="text-sm text-gray-800">
                    {selectedUser.name}
                    <span className="ml-2 text-xs text-gray-500">
                      {formatPhone(selectedUser.phone)}
                      {selectedUser.household ? ` · ${selectedUser.household}` : ''}
                      {selectedUser.is_resident ? ' · 세대원' : ''}
                    </span>
                  </span>
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="text-xs text-gray-500 hover:text-gray-800"
                  >
                    변경
                  </button>
                </div>
              ) : (
                <div>
                  <input
                    type="text"
                    value={userQuery}
                    onChange={e => setUserQuery(e.target.value)}
                    placeholder="이름 또는 전화번호로 검색"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                  />
                  {userResults.length > 0 && (
                    <ul className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
                      {userResults.map(u => (
                        <li key={u.id}>
                          <button
                            onClick={() => {
                              setSelectedUser(u)
                              setUserResults([])
                            }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                          >
                            {u.name}
                            <span className="ml-2 text-xs text-gray-500">
                              {formatPhone(u.phone)}
                              {u.household ? ` · ${u.household}` : ''}
                              {u.is_resident ? ' · 세대원' : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <input
                  type="text"
                  value={guestName}
                  onChange={e => setGuestName(e.target.value)}
                  placeholder="이름"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={e => setGuestPhone(e.target.value)}
                  placeholder="전화번호"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                />
              </div>
            )}
          </div>

          {/* 공간 · 날짜 · 시간 */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">공간</label>
              <select
                value={formSpace}
                onChange={e => setFormSpace(e.target.value as 'nolter' | 'soundroom')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="nolter">놀터</option>
                <option value="soundroom">방음실</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">사용 날짜</label>
              <input
                type="date"
                value={formDate}
                max={new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().split('T')[0]}
                onChange={e => setFormDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">시작</label>
              <select
                value={formStart}
                onChange={e => {
                  setFormStart(e.target.value)
                  // 시작이 종료를 넘어서면 종료를 비워 잘못된 구간이 남지 않게 한다.
                  if (formEnd && e.target.value >= formEnd) setFormEnd('')
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="">선택</option>
                {START_SLOTS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">종료</label>
              <select
                value={formEnd}
                onChange={e => setFormEnd(e.target.value)}
                disabled={!formStart}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm disabled:bg-gray-50"
              >
                <option value="">선택</option>
                {END_SLOTS.filter(t => !formStart || t > formStart).map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 메모 */}
          <div className="mb-4">
            <label className="block text-xs text-gray-600 mb-1">메모 (등록 사유)</label>
            <input
              type="text"
              value={formNote}
              onChange={e => setFormNote(e.target.value)}
              placeholder="예: 요일 착각으로 예약 없이 사용"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>

          {/* 과금 미리보기 */}
          {previewError ? (
            <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {previewError}
            </div>
          ) : preview ? (
            <div className="mb-4 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm">
              <span className="text-gray-600">과금 미리보기 · </span>
              <span className="font-medium text-gray-900">{preview.summary || '무료'}</span>
              {preview.amount > 0 && (
                <span className="ml-2 text-xs text-amber-700">
                  입금 대기(pending)로 등록됩니다
                </span>
              )}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                resetForm()
                setFormOpen(false)
              }}
              className="px-4 py-2 rounded-md text-sm text-gray-700 hover:bg-gray-100"
            >
              취소
            </button>
            <button
              onClick={handleCreateRetroactive}
              disabled={submitting}
              className="px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300"
            >
              {submitting ? '등록 중...' : '소급 등록'}
            </button>
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">🔍 필터</h2>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-xs text-gray-600 mb-1">상태</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">전체</option>
              <option value="confirmed">확정</option>
              <option value="pending">대기</option>
              <option value="cancelled">취소</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">공간</label>
            <select
              value={space}
              onChange={(e) => setSpace(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            >
              <option value="">전체</option>
              <option value="nolter">놀터</option>
              <option value="soundroom">방음실</option>
            </select>
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">세대</label>
            <input
              type="text"
              value={household}
              onChange={(e) => setHousehold(e.target.value)}
              placeholder="예: 101동 101호"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">시작일</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
          
          <div>
            <label className="block text-xs text-gray-600 mb-1">종료일</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </div>
        </div>
      </div>
      
      {/* 예약 리스트 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">로딩 중...</div>
        ) : bookings.length === 0 ? (
          <div className="p-8 text-center text-gray-500">예약이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">예약일</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">시간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">공간</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">세대</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">금액</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {bookings.map((booking) => (
                  <tr key={booking.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatDate(booking.booking_date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {booking.start_time} ~ {booking.end_time}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {getSpaceName(booking.space)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {booking.name}
                      {!booking.user_id && (
                        <span className="ml-1 text-xs text-gray-500">(비회원)</span>
                      )}
                      {booking.created_by_admin && (
                        <span
                          className="ml-1 px-1.5 py-0.5 text-xs bg-purple-100 text-purple-700 rounded"
                          title={booking.admin_note || '관리자 소급 등록'}
                        >
                          소급
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {booking.household || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatPhone(booking.phone)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {booking.amount > 0 ? `${booking.amount.toLocaleString()}원` : '무료'}
                    </td>
                    <td className="px-4 py-3">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="px-4 py-3">
                      {booking.status !== 'cancelled' && (
                        <button
                          onClick={() => handleCancelBooking(booking.id, booking)}
                          className="text-sm text-red-600 hover:text-red-800"
                        >
                          취소
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
