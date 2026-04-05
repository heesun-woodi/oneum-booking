// 선불권 상태 라벨 (전체 앱 공통)
export const PREPAID_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending:           { label: '입금 대기',  className: 'bg-yellow-100 text-yellow-700' },
  paid:              { label: '사용 중',    className: 'bg-green-100 text-green-700' },
  refund_requested:  { label: '환불 신청',  className: 'bg-orange-100 text-orange-700' },
  refunded:          { label: '환불 완료',  className: 'bg-gray-100 text-gray-500' },
  cancelled:         { label: '자동 취소',  className: 'bg-red-100 text-red-600' },
}

// 예약 상태 라벨 (전체 앱 공통)
export const BOOKING_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending:    { label: '입금 대기 중', className: 'bg-yellow-100 text-yellow-700' },
  confirmed:  { label: '확정',        className: 'bg-green-100 text-green-700' },
  completed:  { label: '이용완료',    className: 'bg-blue-100 text-blue-700' },
  cancelled:  { label: '예약 취소됨', className: 'bg-gray-100 text-gray-500' },
}
