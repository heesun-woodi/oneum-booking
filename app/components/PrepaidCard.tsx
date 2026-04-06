'use client'

import { useState } from 'react'
import { PrepaidPurchase } from '@/app/actions/prepaid'
import { PREPAID_STATUS_LABELS } from '@/lib/constants/status-labels'

interface PrepaidCardProps {
  purchase: PrepaidPurchase
  onRefund: (purchaseId: string) => Promise<void>
}

export function PrepaidCard({ purchase, onRefund }: PrepaidCardProps) {
  const [isRefunding, setIsRefunding] = useState(false)

  const usedHours = purchase.total_hours - purchase.remaining_hours
  const usagePercent = (usedHours / purchase.total_hours) * 100
  const canRefund = purchase.status === 'paid' && usedHours < 8

  // 상태 뱃지
  const statusBadge = () => {
    const statusInfo = PREPAID_STATUS_LABELS[purchase.status]
    if (!statusInfo) return null
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 text-sm font-semibold rounded-full ${statusInfo.className}`}>
        {statusInfo.label}
      </span>
    )
  }

  // 유효기간 표시
  const getExpiryText = () => {
    if (purchase.status === 'pending') {
      return '입금 확인 후 6개월간 유효'
    }
    if (purchase.status === 'refunded') {
      return '환불됨'
    }
    if (purchase.expires_at) {
      const expiryDate = new Date(purchase.expires_at)
      const formattedDate = expiryDate.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).replace(/\. /g, '-').replace('.', '')
      
      // 만료 여부 확인
      const now = new Date()
      if (expiryDate < now) {
        return (
          <span className="text-red-600 font-semibold">
            {formattedDate} (만료됨)
          </span>
        )
      }
      return `${formattedDate}까지 유효`
    }
    return '유효기간 미확정'
  }

  // 환불 처리
  const handleRefund = async () => {
    const usedHours = purchase.total_hours - purchase.remaining_hours
    const regularPrice = 14000
    const refundAmount = (purchase.product?.price || 0) - (usedHours * regularPrice)

    const confirmMessage = `환불 시 사용한 시간은 시간당 14,000원으로 계산됩니다.\n\n예상 환불 금액: ${refundAmount.toLocaleString()}원\n\n환불하시겠습니까?`

    if (!confirm(confirmMessage)) {
      return
    }

    setIsRefunding(true)
    try {
      await onRefund(purchase.id)
    } catch (error) {
      console.error('환불 처리 오류:', error)
      alert('환불 처리 중 오류가 발생했습니다.')
    } finally {
      setIsRefunding(false)
    }
  }

  // 구매일 포맷
  const purchaseDate = new Date(purchase.created_at).toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).replace(/\. /g, '-').replace('.', '')

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow">
      {/* 헤더: 상품명 + 상태 */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900">
          🎟️ {purchase.product?.name || '선불권'}
        </h3>
        {statusBadge()}
      </div>

      {/* 사용/잔여 횟수 */}
      <div className="mb-4">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-gray-600">
            사용: <span className="font-semibold text-purple-600">{usedHours}h</span>
          </span>
          <span className="text-gray-600">
            남음: <span className="font-semibold text-purple-600">{purchase.remaining_hours}h</span>
          </span>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
          <div
            className="bg-purple-600 h-full transition-all duration-300"
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        <div className="text-xs text-gray-500 mt-1 text-right">
          {usagePercent.toFixed(0)}% 사용
        </div>
      </div>

      {/* 구매일 */}
      <div className="space-y-2 text-sm text-gray-600 mb-4">
        <div>
          <span className="font-medium">구매일:</span> {purchaseDate}
        </div>
      </div>

      {/* 환불 버튼 */}
      {canRefund && (
        <button
          onClick={handleRefund}
          disabled={isRefunding}
          className="w-full py-3 bg-red-50 text-red-600 font-semibold rounded-lg border border-red-200 hover:bg-red-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isRefunding ? '환불 처리 중...' : '환불 신청'}
        </button>
      )}

      {/* 환불 불가 안내 */}
      {purchase.status === 'paid' && usedHours >= 8 && (
        <div className="text-xs text-gray-500 text-center bg-gray-50 py-2 rounded">
          8시간 이상 사용하셨으므로 환불이 불가능합니다.
        </div>
      )}
    </div>
  )
}
