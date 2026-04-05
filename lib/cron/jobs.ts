/**
 * 크론 작업 핸들러들
 */

import { supabase } from '../supabase'
import { sendNotification } from '../notifications/sender'
import { formatBookingList } from '../notifications/templates'

/**
 * 1. 미입금 자동 취소 (00:00)
 */
export async function autoCancelUnpaid(): Promise<{
  cancelled: number
}> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  // 내일 예약 중 미입금 비회원 조회
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_type', 'non-member')
    .eq('payment_status', 'pending')
    .eq('booking_date', tomorrowStr)
    .eq('status', 'pending')

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

  // D-X 미입금 예약 조회
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_type', 'non-member')
    .eq('payment_status', 'pending')
    .eq('booking_date', targetDateStr)
    .eq('status', 'pending')

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
 * 4. 재무 알림 (16:00 / 21:00 / 23:30)
 */
export async function financeAlert(
  type: 'first' | 'follow' | 'final'
): Promise<{
  sent: number
}> {
  let targetDate = new Date()
  let targetBookings: any[] = []

  if (type === 'first') {
    // 당일 예약 중 미입금 (21시 이전)
    const todayStr = targetDate.toISOString().split('T')[0]

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('member_type', 'non-member')
      .eq('payment_status', 'pending')
      .eq('booking_date', todayStr)
      .eq('status', 'pending')
      .lt('start_time', '21:00')

    targetBookings = bookings || []
  } else if (type === 'follow') {
    // 당일 예약 중 미입금 (전체)
    const todayStr = targetDate.toISOString().split('T')[0]

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('member_type', 'non-member')
      .eq('payment_status', 'pending')
      .eq('booking_date', todayStr)
      .eq('status', 'pending')

    targetBookings = bookings || []
  } else if (type === 'final') {
    // D-1 미입금 예약
    targetDate.setDate(targetDate.getDate() + 1)
    const tomorrowStr = targetDate.toISOString().split('T')[0]

    const { data: bookings } = await supabase
      .from('bookings')
      .select('*')
      .eq('member_type', 'non-member')
      .eq('payment_status', 'pending')
      .eq('booking_date', tomorrowStr)
      .eq('status', 'pending')

    targetBookings = bookings || []
  }

  if (targetBookings.length === 0) {
    return { sent: 0 }
  }

  // 재무담당자에게 발송
  await sendNotification({
    type: '5-2',
    phone: process.env.FINANCE_PHONE || '',
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
  const cutoff = new Date()
  cutoff.setHours(cutoff.getHours() - 48)

  const { data: purchases, error } = await supabase
    .from('prepaid_purchases')
    .select('id, user_id, total_hours')
    .eq('status', 'pending')
    .lt('created_at', cutoff.toISOString())

  if (error || !purchases) {
    console.error('선불권 미입금 조회 실패:', error)
    return { cancelled: 0 }
  }

  if (purchases.length === 0) return { cancelled: 0 }

  const { error: updateError } = await supabase
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
 * 6. 당일 예약 리마인더 (09:00)
 */
export async function sameDayReminder(): Promise<{
  sent: number
}> {
  const now = new Date()
  const todayStr = now.toISOString().split('T')[0]

  // 오늘 전체 예약 조회 (비회원만)
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('*')
    .eq('member_type', 'non-member')
    .eq('booking_date', todayStr)
    .eq('status', 'confirmed')

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
