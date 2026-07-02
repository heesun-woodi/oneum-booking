/**
 * 크론 작업 핸들러들
 */

import { supabase } from '../supabase'
import { createServiceRoleClient } from '../supabase/server'
import { sendNotification } from '../notifications/sender'
import { formatBookingList, formatPrepaidSummaryVars } from '../notifications/templates'

/**
 * 1. 미입금 자동 취소 (00:00)
 */
export async function autoCancelUnpaid(): Promise<{
  cancelled: number
}> {
  // 한국시간(KST=UTC+9) 기준 '오늘' 날짜.
  // 이 크론은 매일 KST 00:00(vercel.json 기준 "0 15 * * *" = 15:00 UTC)에 실행된다.
  // 정책: 사용일 '전날 23:59'까지 입금 확인이 안 되면 자동취소 → 사용일 당일 00:00 KST에 오늘(이하) 사용분을 취소.
  const kstToday = new Date(Date.now() + 9 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  // 사용일이 '오늘(KST) 이하'인 미입금 예약 조회 (비회원 + 놀터 유료 회원)
  // .lte로 조회해, 전날 늦게 잡아 검사 창을 놓친 건과 과거 잔여분까지 함께 정리한다.
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('payment_status', 'pending')
    .lte('booking_date', kstToday)
    .eq('status', 'pending')
    .gt('amount', 0)

  if (error || !bookings) {
    console.error('미입금 예약 조회 실패:', error)
    return { cancelled: 0 }
  }

  // 일괄 취소
  for (const booking of bookings) {
    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
        cancellation_reason: '입금 미확인 자동 취소',
      })
      .eq('id', booking.id)

    console.log(`자동 취소: ${booking.id} - ${booking.name}`)
  }

  return { cancelled: bookings.length }
}

/**
 * 2. 전날 리마인더 (09:00)
 */
export async function dayBeforeReminder(): Promise<{
  sent: number
}> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // 내일 예약자 조회
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_date', tomorrowStr)
    .eq('status', 'confirmed')

  if (error || !bookings) {
    console.error('내일 예약 조회 실패:', error)
    return { sent: 0 }
  }

  let sent = 0

  for (const booking of bookings) {
    const dateStr = new Date(booking.booking_date).toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })

    if (booking.member_type === 'member') {
      // 4-3: 회원용
      await sendNotification({
        type: '4-3',
        phone: booking.phone,
        variables: {
          name: booking.name,
          household: booking.household,
          date: dateStr,
          time: `${booking.start_time} ~ ${booking.end_time}`,
          space: booking.space === 'nolter' ? '놀터' : '방음실',
        },
        bookingId: booking.id,
      })
      sent++
    } else if (booking.payment_status === 'completed') {
      // 4-1: 비회원 (입금완료만)
      await sendNotification({
        type: '4-1',
        phone: booking.phone,
        variables: {
          name: booking.name,
          date: dateStr,
          time: `${booking.start_time} ~ ${booking.end_time}`,
          space: booking.space === 'nolter' ? '놀터' : '방음실',
        },
        bookingId: booking.id,
      })
      sent++
    }
  }

  return { sent }
}

/**
 * 3. 입금 리마인더 (13:00) - D-7/5/2
 */
export async function paymentReminder(daysUntil: number = 7): Promise<{
  sent: number
}> {
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + daysUntil)
  const targetDateStr = targetDate.toISOString().split('T')[0]

  // D-X 미입금 예약 조회 (비회원 + 놀터 유료 회원)
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('payment_status', 'pending')
    .eq('booking_date', targetDateStr)
    .eq('status', 'pending')
    .gt('amount', 0)

  if (error || !bookings) {
    return { sent: 0 }
  }

  let sent = 0

  for (const booking of bookings) {
    const deadline = new Date(booking.booking_date)
    deadline.setDate(deadline.getDate() - 1)
    const deadlineStr = deadline.toLocaleDateString('ko-KR', {
      month: 'long',
      day: 'numeric',
    })

    await sendNotification({
      type: '3-2',
      phone: booking.phone,
      variables: {
        name: booking.name,
        date: new Date(booking.booking_date).toLocaleDateString('ko-KR', {
          month: 'long',
          day: 'numeric',
        }),
        amount: booking.amount.toLocaleString(),
        account: process.env.BANK_ACCOUNT || '',
        deadline: deadlineStr,
      },
      bookingId: booking.id,
    })
    sent++
  }

  return { sent }
}

/**
 * 4. 재무 알림 (23:30 KST) — 내일 미입금 예약을 재무담당자에게 알림
 */
export async function financeAlert(): Promise<{
  sent: number
}> {
  // 내일(D+1) 미입금 예약을 재무담당자에게 알림 (자정 자동취소 직전 마지막 heads-up).
  // 당일 미입금(기존 first/follow)은 사용일 당일 00:00 자동취소로 대상이 사라져 제거함.
  const targetDate = new Date()
  targetDate.setDate(targetDate.getDate() + 1)
  const tomorrowStr = targetDate.toISOString().split('T')[0]

  const { data: bookings } = await supabase
    .from('bookings')
    .select('*')
    .eq('payment_status', 'pending')
    .eq('booking_date', tomorrowStr)
    .eq('status', 'pending')
    .gt('amount', 0)

  const targetBookings = bookings || []

  if (targetBookings.length === 0) {
    return { sent: 0 }
  }

  // 재무담당자에게 발송
  await sendNotification({
    type: '5-2',
    phone: process.env.FINANCE_PHONE || '',
    recipientName: '재무담당자',
    variables: {
      count: targetBookings.length.toString(),
      list: formatBookingList(targetBookings),
      adminUrl: process.env.NEXT_PUBLIC_APP_URL 
        ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/payments`
        : 'https://oneum.vercel.app/admin/payments',
    },
  })

  return { sent: 1 }
}

/**
 * 5. 선불권 48시간 미입금 자동 취소 (매시간)
 */
export async function autoCancelPrepaid(): Promise<{
  cancelled: number
}> {
  const serviceSupabase = await createServiceRoleClient()
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)

  const { data: purchases, error } = await serviceSupabase
    .from('prepaid_purchases')
    .select('id, user_id, total_hours')
    .eq('status', 'pending')
    .lt('created_at', cutoff.toISOString())

  if (error || !purchases) {
    console.error('선불권 미입금 조회 실패:', error)
    return { cancelled: 0 }
  }

  if (purchases.length === 0) return { cancelled: 0 }

  const { error: updateError } = await serviceSupabase
    .from('prepaid_purchases')
    .update({
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .in('id', purchases.map((p: { id: string }) => p.id))

  if (updateError) {
    console.error('선불권 자동 취소 실패:', updateError)
    return { cancelled: 0 }
  }

  console.log(`선불권 자동 취소: ${purchases.length}건`)
  return { cancelled: purchases.length }
}

/**
 * 선불권 미입금 리마인더 헬퍼 - 공통 발송 로직
 */
async function sendPrepaidPaymentReminder(): Promise<{ sent: number }> {
  const serviceSupabase = await createServiceRoleClient()
  const adminUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://oneum.vercel.app'}/admin/prepaid`

  const { data: purchases, error } = await serviceSupabase
    .from('prepaid_purchases')
    .select(`
      id, created_at,
      user:users!prepaid_purchases_user_id_fkey(name, household, phone),
      product:prepaid_products!prepaid_purchases_product_id_fkey(name, price)
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error || !purchases || purchases.length === 0) {
    console.log('선불권 미입금 없음')
    return { sent: 0 }
  }

  const summaryItems = purchases.map((p: any) => {
    const deadline = new Date(p.created_at)
    deadline.setHours(deadline.getHours() + 48)
    return {
      name: p.user?.name || '알수없음',
      household: p.user?.household || undefined,
      productName: p.product?.name || '선불권',
      amount: p.product?.price || 0,
      deadline,
    }
  })

  const summaryVars = formatPrepaidSummaryVars(summaryItems)

  await sendNotification({
    type: '7-2',
    phone: process.env.FINANCE_PHONE || '',
    recipientName: '재무담당자',
    variables: { ...summaryVars, adminUrl },
  })

  console.log(`선불권 미입금 리마인더 발송: ${purchases.length}건`)
  return { sent: 1 }
}

/**
 * 선불권 미입금 일일 리마인더 (매일 13:00 KST = 04:00 UTC)
 */
export async function prepaidPaymentReminder(): Promise<{ sent: number }> {
  return sendPrepaidPaymentReminder()
}

/**
 * 선불권 미입금 최종 리마인더 (매일 10:00 KST = 01:00 UTC, auto-cancel 1h 전)
 * 44시간 이상 경과한 미입금 건만 대상
 */
export async function prepaidFinalReminder(): Promise<{ sent: number }> {
  const serviceSupabase = await createServiceRoleClient()
  const cutoff44h = new Date()
  cutoff44h.setHours(cutoff44h.getHours() - 44)

  const { data: pending, error } = await serviceSupabase
    .from('prepaid_purchases')
    .select('id')
    .eq('status', 'pending')
    .lt('created_at', cutoff44h.toISOString())

  if (error || !pending || pending.length === 0) {
    console.log('선불권 최종 리마인더 대상 없음')
    return { sent: 0 }
  }

  return sendPrepaidPaymentReminder()
}

/**
 * 6. 선불권 입금 안내 (신청 다음날 10:00 KST = 01:00 UTC)
 * 어제 KST 기준으로 신청된 pending 선불권에 개별 발송
 */
export async function prepaidPaymentGuide(): Promise<{ sent: number }> {
  const serviceSupabase = await createServiceRoleClient()
  // KST 어제 범위 계산
  const now = new Date()
  const nowKST = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const kstYesterdayStart = new Date(nowKST)
  kstYesterdayStart.setUTCDate(kstYesterdayStart.getUTCDate() - 1)
  kstYesterdayStart.setUTCHours(0, 0, 0, 0)
  const kstYesterdayEnd = new Date(kstYesterdayStart)
  kstYesterdayEnd.setUTCHours(23, 59, 59, 999)

  const utcStart = new Date(kstYesterdayStart.getTime() - 9 * 60 * 60 * 1000)
  const utcEnd = new Date(kstYesterdayEnd.getTime() - 9 * 60 * 60 * 1000)

  const { data: purchases, error } = await serviceSupabase
    .from('prepaid_purchases')
    .select(`
      id, created_at,
      user:users!prepaid_purchases_user_id_fkey(name, phone),
      product:prepaid_products!prepaid_purchases_product_id_fkey(name, price)
    `)
    .eq('status', 'pending')
    .gte('created_at', utcStart.toISOString())
    .lte('created_at', utcEnd.toISOString())

  if (error || !purchases || purchases.length === 0) {
    console.log('선불권 입금 안내 대상 없음')
    return { sent: 0 }
  }

  let sent = 0
  for (const p of purchases as any[]) {
    const deadline = new Date(new Date(p.created_at).getTime() + 48 * 60 * 60 * 1000)
    const deadlineStr = deadline.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' })

    await sendNotification({
      type: '7-4',
      phone: p.user?.phone || '',
      variables: {
        name: p.user?.name || '',
        amount: (p.product?.price || 0).toLocaleString(),
        account: process.env.BANK_ACCOUNT || '',
        deadline: deadlineStr,
      },
    })
    sent++
  }

  console.log(`선불권 입금 안내 발송: ${sent}건`)
  return { sent }
}

/**
 * 7. 당일 예약 리마인더 (09:00)
 */
export async function sameDayReminder(): Promise<{
  sent: number
}> {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // 오늘 확정 예약 조회 (세대원 무료 제외)
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('booking_date', todayStr)
    .eq('status', 'confirmed')
    .neq('payment_method', 'free')

  if (error || !bookings) {
    return { sent: 0 }
  }

  // 계절 감지
  const month = now.getMonth() + 1
  const season = month >= 6 && month <= 8 ? 'summer'
    : (month === 12 || month <= 2) ? 'winter'
    : 'other'

  let sent = 0

  for (const booking of bookings) {
    await sendNotification({
      type: '4-2',
      phone: booking.phone,
      variables: {
        name: booking.name,
        time: booking.start_time,
        space: booking.space === 'nolter' ? '놀터' : '방음실',
        season: season,
      },
      bookingId: booking.id,
    })
    sent++
  }

  return { sent }
}
