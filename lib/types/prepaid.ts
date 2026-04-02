/**
 * 선불권 시스템 TypeScript 타입 정의
 * Phase 6.2
 */

// =====================================================
// 선불권 상품
// =====================================================
export interface PrepaidProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  regular_price: number;
  hours: number;
  validity_months: number;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
}

// =====================================================
// 선불권 구매 내역
// =====================================================
export type PrepaidPurchaseStatus = 'pending' | 'paid' | 'refunded';

export interface PrepaidPurchase {
  id: string;
  user_id: string;
  product_id: string;
  total_hours: number;
  remaining_hours: number;
  purchased_at: string;
  paid_at: string | null;
  expires_at: string | null;
  status: PrepaidPurchaseStatus;
  refund_amount: number | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

// 확장 타입: 상품 정보 포함
export interface PrepaidPurchaseWithProduct extends PrepaidPurchase {
  product: PrepaidProduct;
}

// =====================================================
// 선불권 사용 내역
// =====================================================
export interface PrepaidUsage {
  id: string;
  purchase_id: string;
  booking_id: string;
  hours_used: number;
  used_at: string;
}

// =====================================================
// API 요청/응답 타입
// =====================================================

// 구매 신청 요청
export interface CreatePurchaseRequest {
  product_id: string;
}

// 구매 신청 응답
export interface CreatePurchaseResponse {
  success: boolean;
  purchase?: PrepaidPurchase;
  error?: string;
}

// 내 구매 내역 조회 응답
export interface MyPurchasesResponse {
  success: boolean;
  purchases?: PrepaidPurchaseWithProduct[];
  error?: string;
}

// 환불 신청 요청
export interface RefundRequest {
  purchase_id: string;
  reason?: string;
}

// 환불 계산 결과
export interface RefundCalculation {
  total_paid: number;        // 결제 금액
  hours_used: number;         // 사용 시간
  cost_per_hour: number;      // 시간당 비용 (14,000원)
  used_amount: number;        // 사용 금액
  refund_amount: number;      // 환불 금액
  refundable: boolean;        // 환불 가능 여부
}

// 환불 신청 응답
export interface RefundResponse {
  success: boolean;
  calculation?: RefundCalculation;
  purchase?: PrepaidPurchase;
  error?: string;
}

// =====================================================
// 유틸리티 함수 타입
// =====================================================

// 선불권 유효성 체크
export interface PrepaidValidation {
  isValid: boolean;
  isExpired: boolean;
  isPaid: boolean;
  hasRemainingHours: boolean;
  remainingHours: number;
  expiresAt: string | null;
}

// 예약 시 선불권 사용 계산
export interface PrepaidBookingCalculation {
  totalHoursNeeded: number;      // 필요한 총 시간
  prepaidHoursUsed: number;      // 선불권 사용 시간
  regularHoursNeeded: number;    // 일반 결제 필요 시간
  regularAmount: number;         // 일반 결제 금액
  purchasesToUse: Array<{        // 사용할 선불권 목록
    purchase_id: string;
    hours: number;
  }>;
}
