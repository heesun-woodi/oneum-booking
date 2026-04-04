'use server'

import { createServiceRoleClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { sendNotification } from '@/lib/notifications/sender'

export interface AdminPrepaidPurchase {
  id: string
  user_id: string
  product_id: string
  total_hours: number
  remaining_hours: number
  purchased_at: string
  paid_at: string | null
  expires_at: string | null
  status: 'pending' | 'paid' | 'refund_requested' | 'refunded' | 'cancelled'
  refund_amount: number | null
  refunded_at: string | null
  created_at: string
  updated_at: string
  user?: {
    id: string
    name: string
    household: string
    phone: string
  }
  product?: {
    id: string
    name: string
    price: number
    hours: number
    validity_months: number
  }
}

// 전체 선불권 신청 목록 조회
export async function getAllPrepaidPurchases(): Promise<{
  success: boolean
  purchases: AdminPrepaidPurchase[]
  error?: string
}> {
  const supabase = await createServiceRoleClient()

  const { data, error } = await supabase
    .from('prepaid_purchases')
    .select(`
      *,
      user:users(id, name, household, phone),
      product:prepaid_products(id, name, price, hours, validity_months)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return { success: false, purchases: [], error: error.message }
  }

  return { success: true, purchases: (data ?? []) as AdminPrepaidPurchase[] }
}

// 입금 확인 처리: pending → paid
export async function confirmPrepaidPayment(purchaseId: string): Promise<{
  success: boolean
  error?: string
}> {
  const supabase = await createServiceRoleClient()

  const { data: purchase, error: fetchError } = await supabase
    .from('prepaid_purchases')
    .select(`
      *,
      product:prepaid_products(validity_months, name, hours),
      user:users(id, name, phone)
    `)
    .eq('id', purchaseId)
    .single()

  if (fetchError || !purchase) {
    return { success: false, error: '선불권을 찾을 수 없습니다.' }
  }

  if (purchase.status !== 'pending') {
    return { success: false, error: '입금 대기 상태가 아닙니다.' }
  }

  const now = new Date()
  const validityMonths = purchase.product?.validity_months ?? 6
  const expiresAt = new Date(now)
  expiresAt.setMonth(expiresAt.getMonth() + validityMonths)

  const { error } = await supabase
    .from('prepaid_purchases')
    .update({
      status: 'paid',
      paid_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', purchaseId)

  if (error) {
    return { success: false, error: error.message }
  }

  // SMS: 사용자에게 선불권 활성화 알림
  if (purchase.user?.phone) {
    await sendNotification({
      type: '7-3',
      phone: purchase.user.phone,
      variables: {
        name: purchase.user.name,
        productName: purchase.product?.name || '선불권',
        totalHours: String(purchase.product?.hours ?? purchase.total_hours),
        expiresAt: expiresAt.toLocaleDateString('ko-KR', {
          year: 'numeric', month: 'long', day: 'numeric',
        }),
      },
      userId: purchase.user.id,
    }).catch((e) => console.error('선불권 활성화 SMS 실패:', e))
  }

  revalidatePath('/admin/prepaid')
  return { success: true }
}

// 환불 승인: refund_requested → refunded
export async function approvePrepaidRefund(purchaseId: string): Promise<{
  success: boolean
  refundAmount?: number
  error?: string
}> {
  const supabase = await createServiceRoleClient()

  const { data: purchase, error: fetchError } = await supabase
    .from('prepaid_purchases')
    .select('*')
    .eq('id', purchaseId)
    .single()

  if (fetchError || !purchase) {
    return { success: false, error: '선불권을 찾을 수 없습니다.' }
  }

  if (purchase.status !== 'refund_requested') {
    return { success: false, error: '환불 신청 상태가 아닙니다.' }
  }

  const now = new Date()

  const { error } = await supabase
    .from('prepaid_purchases')
    .update({
      status: 'refunded',
      refunded_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', purchaseId)

  if (error) {
    return { success: false, error: error.message }
  }

  revalidatePath('/admin/prepaid')
  return { success: true, refundAmount: purchase.refund_amount ?? 0 }
}
