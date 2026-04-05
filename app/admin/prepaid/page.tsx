'use client'

import { useEffect, useState } from 'react'
import {
  getAllPrepaidPurchases,
  confirmPrepaidPayment,
  approvePrepaidRefund,
  type AdminPrepaidPurchase,
} from '@/app/actions/admin-prepaid'
import { maskPhone } from '@/lib/notifications/templates'
import { PREPAID_STATUS_LABELS } from '@/lib/constants/status-labels'

type PrepaidFilter = 'all' | 'pending' | 'paid' | 'refund_requested' | 'refunded' | 'cancelled'


export default function AdminPrepaidPage() {
  const [purchases, setPurchases] = useState<AdminPrepaidPurchase[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<PrepaidFilter>('pending')
  const [processingId, setProcessingId] = useState<string | null>(null)

  useEffect(() => {
    loadPurchases()
  }, [])

  async function loadPurchases() {
    setLoading(true)
    const result = await getAllPrepaidPurchases()
    if (result.success) {
      setPurchases(result.purchases)
    }
    setLoading(false)
  }

  async function handleConfirmPayment(purchaseId: string, userName: string, productName?: string, productPrice?: number) {
    if (!confirm(`${userName}님의 ${productName || '선불권'}(${(productPrice ?? 0).toLocaleString()}원) 입금을 확인하시겠습니까?`)) return

    setProcessingId(purchaseId)
    const result = await confirmPrepaidPayment(purchaseId)
    setProcessingId(null)

    if (result.success) {
      alert('입금이 확인되었습니다. 선불권이 활성화되었습니다.')
      loadPurchases()
    } else {
      alert('오류: ' + result.error)
    }
  }

  async function handleApproveRefund(purchaseId: string, userName: string, refundAmount: number | null) {
    const amountText = refundAmount ? `환불 금액: ${refundAmount.toLocaleString()}원` : ''
    if (!confirm(`${userName}님의 환불 신청을 승인하시겠습니까?\n${amountText}`)) return

    setProcessingId(purchaseId)
    const result = await approvePrepaidRefund(purchaseId)
    setProcessingId(null)

    if (result.success) {
      alert(`환불이 승인되었습니다.\n환불 금액: ${(result.refundAmount ?? 0).toLocaleString()}원\n사용자 계좌로 직접 환불을 진행해주세요.`)
      loadPurchases()
    } else {
      alert('오류: ' + result.error)
    }
  }

  const counts = {
    all: purchases.length,
    pending: purchases.filter((p) => p.status === 'pending').length,
    paid: purchases.filter((p) => p.status === 'paid').length,
    refund_requested: purchases.filter((p) => p.status === 'refund_requested').length,
    refunded: purchases.filter((p) => p.status === 'refunded').length,
    cancelled: purchases.filter((p) => p.status === 'cancelled').length,
  }

  const filtered = filter === 'all' ? purchases : purchases.filter((p) => p.status === filter)

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">🎟️ 선불권 관리</h1>
          <p className="mt-2 text-gray-600">선불권 신청 현황 및 입금 확인을 관리합니다.</p>
        </div>

        {/* 요약 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-yellow-600">{counts.pending}</p>
            <p className="text-sm text-gray-500 mt-1">입금 대기</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-green-600">{counts.paid}</p>
            <p className="text-sm text-gray-500 mt-1">활성 선불권</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-orange-500">{counts.refund_requested}</p>
            <p className="text-sm text-gray-500 mt-1">환불 신청</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-2xl font-bold text-gray-500">{counts.refunded}</p>
            <p className="text-sm text-gray-500 mt-1">환불 완료</p>
          </div>
        </div>

        {/* 필터 + 새로고침 */}
        <div className="bg-white rounded-lg shadow p-4 mb-6 flex items-center gap-2 flex-wrap">
          {(
            [
              { key: 'pending', label: `입금 대기 (${counts.pending})`, active: 'bg-yellow-500 text-white' },
              { key: 'refund_requested', label: `환불 신청 (${counts.refund_requested})`, active: 'bg-orange-500 text-white' },
              { key: 'paid', label: `사용 중 (${counts.paid})`, active: 'bg-green-500 text-white' },
              { key: 'refunded', label: `환불 완료 (${counts.refunded})`, active: 'bg-gray-500 text-white' },
              { key: 'cancelled', label: `자동 취소 (${counts.cancelled})`, active: 'bg-red-500 text-white' },
              { key: 'all', label: `전체 (${counts.all})`, active: 'bg-blue-500 text-white' },
            ] as const
          ).map(({ key, label, active }) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === key ? active : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={loadPurchases}
            className="ml-auto px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            🔄 새로고침
          </button>
        </div>

        {/* 테이블 */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-500">해당하는 선불권 신청이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['신청일', '이름', '세대', '전화번호', '상품', '금액', '잔여/총시간', '만료일', '상태', '처리'].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filtered.map((p) => {
                    const statusInfo = PREPAID_STATUS_LABELS[p.status] ?? { label: p.status, className: 'bg-gray-100 text-gray-600' }
                    const isProcessing = processingId === p.id

                    return (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {new Date(p.created_at).toLocaleDateString('ko-KR')}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {p.user?.name ?? '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                          {p.user?.household ? `${p.user.household}호` : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {p.user?.phone ? maskPhone(p.user.phone) : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {p.product?.name ?? '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {(p.product?.price ?? 0).toLocaleString()}원
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-900">
                          {p.remaining_hours} / {p.total_hours}시간
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                          {p.expires_at
                            ? new Date(p.expires_at).toLocaleDateString('ko-KR')
                            : '-'}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}>
                            {statusInfo.label}
                          </span>
                          {p.status === 'refund_requested' && p.refund_amount && (
                            <p className="text-xs text-orange-600 mt-1">
                              환불액: {p.refund_amount.toLocaleString()}원
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          {p.status === 'pending' && (
                            <button
                              onClick={() => handleConfirmPayment(p.id, p.user?.name ?? '', p.product?.name, p.product?.price)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                            >
                              {isProcessing ? '처리중...' : '입금 확인'}
                            </button>
                          )}
                          {p.status === 'refund_requested' && (
                            <button
                              onClick={() => handleApproveRefund(p.id, p.user?.name ?? '', p.refund_amount)}
                              disabled={isProcessing}
                              className="px-3 py-1.5 bg-orange-600 text-white text-xs font-medium rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
                            >
                              {isProcessing ? '처리중...' : '환불 승인'}
                            </button>
                          )}
                          {(p.status === 'paid' || p.status === 'refunded') && (
                            <span className="text-xs text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* 입금 안내 */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
          💡 입금 확인 후 사용자에게 선불권 활성화 SMS가 자동 발송됩니다.
        </div>
      </div>
    </div>
  )
}
