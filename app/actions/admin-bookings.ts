'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { describeCharge } from '@/lib/booking-policy'
// 과금 계산과 생성은 공개 예약과 같은 코어를 쓴다 (요금 규칙이 갈라지지 않게).
import { createBookingCore, previewBookingCharge } from '@/lib/booking/create-core'
import { cookies } from 'next/headers'
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from '@/lib/admin-session'
import { getKstNow } from '@/lib/date-kst'

export async function getAdminBookings(options: {
  status?: string
  startDate?: string
  endDate?: string
  household?: string
  space?: string
  limit?: number
  offset?: number
} = {}) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('bookings')
      .select('*', { count: 'exact' })
      .order('booking_date', { ascending: false })
      .order('start_time', { ascending: false })
    
    if (options.status) {
      query = query.eq('status', options.status)
    }
    
    if (options.startDate) {
      query = query.gte('booking_date', options.startDate)
    }
    
    if (options.endDate) {
      query = query.lte('booking_date', options.endDate)
    }
    
    if (options.household) {
      query = query.eq('household', options.household)
    }
    
    if (options.space) {
      query = query.eq('space', options.space)
    }
    
    if (options.limit) {
      query = query.limit(options.limit)
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
    }
    
    const { data, error, count } = await query
    
    if (error) {
      return { success: false, error: error.message, bookings: [], total: 0 }
    }
    
    return { success: true, bookings: data || [], total: count || 0 }
  } catch (error) {
    console.error('Get admin bookings error:', error)
    return { success: false, error: '조회 중 오류가 발생했습니다.', bookings: [], total: 0 }
  }
}

export async function getTodayBookings() {
  const today = new Date().toISOString().split('T')[0]
  return getAdminBookings({
    startDate: today,
    endDate: today,
    status: 'confirmed'
  })
}

export async function cancelBookingAdmin(bookingId: string, reason?: string) {
  try {
    const supabase = await createClient()

    const { data: booking, error: checkError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single()

    if (checkError || !booking) {
      return { success: false, error: '예약을 찾을 수 없습니다.' }
    }

    if (booking.status === 'cancelled') {
      return { success: false, error: '이미 취소된 예약입니다.' }
    }

    const isPrepaidBooking = (booking.prepaid_hours_used ?? 0) > 0

    if (isPrepaidBooking) {
      // ⚠️ 선불권 복구는 반드시 service role 로. RLS 하에서는 복구가 조용히 0건 처리된다.
      const serviceSupabase = await createServiceRoleClient()
      const { data: rpcData, error: rpcError } = await serviceSupabase
        .rpc('cancel_booking_restore_prepaid', { p_booking_id: bookingId })

      if (rpcError) throw rpcError
      if (!rpcData?.success) {
        return { success: false, error: rpcData?.error || '선불권 복구 중 오류가 발생했습니다' }
      }

      if (reason) {
        await supabase
          .from('bookings')
          .update({ cancellation_reason: reason })
          .eq('id', bookingId)
      }
    } else {
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: reason || '관리자 취소',
        })
        .eq('id', bookingId)

      if (error) throw error
    }

    return { success: true }
  } catch (error: any) {
    console.error('❌ Cancel booking admin error:', error)
    return { success: false, error: error.message }
  }
}

// =====================================================
// 소급 등록 (예약 없이 사용한 건의 사후 기록)
//
// 공개 예약(createBooking)은 과거 날짜를 차단하기 때문에, 요일 착각 등으로
// 예약 없이 사용한 건을 남길 방법이 없었다. 그때마다 service role 키로 RPC 를
// 직접 호출해야 했고 그 경로는 기록도 남지 않는다.
//
// 과금은 공개 예약과 같은 코어(lib/booking/create-core.ts)를 그대로 탄다.
// 소급이라고 요금 규칙이 달라지지는 않기 때문이다. 다른 것은 세 가지뿐이다.
//   - 과거 날짜 허용 (그게 목적이다)
//   - 확정 문자 미발송 (이미 지난 사용분이라 안내할 것이 없다)
//   - created_by_admin / admin_note 로 '누가 왜 넣었는지' 기록
// =====================================================

/**
 * 서버측 관리자 확인.
 *
 * 신원은 반드시 httpOnly 서명 쿠키에서 읽는다. 클라이언트가 보낸 id 를 믿으면 안 된다 —
 * getBookings() 가 anon 키로 bookings 를 select('*') 해 공개 달력에 내려보내므로,
 * 관리자가 개인 예약을 한 번이라도 하면 그 행의 user_id 로 관리자 UUID 가 공개된다.
 * 그 값을 인자로 받던 구조에서는 공개 데이터만으로 이 검사를 통과할 수 있었다.
 *
 * 쿠키는 '누구인지'만 말해주므로, 실제 권한은 호출 시점에 DB 에서 다시 읽는다
 * (권한이 회수된 관리자의 쿠키가 만료 전까지 남아 있을 수 있다).
 */
async function assertAdmin(): Promise<{ ok: true; adminId: string } | { ok: false; error: string }> {
  const adminId = verifyAdminSessionToken(cookies().get(ADMIN_SESSION_COOKIE)?.value)
  if (!adminId) {
    return { ok: false, error: '관리자 인증이 만료되었습니다. 다시 로그인해주세요.' }
  }

  const supabase = await createServiceRoleClient()
  const { data, error } = await supabase
    .from('users')
    .select('id, is_admin, status, deleted_at')
    .eq('id', adminId)
    .maybeSingle()

  if (error) throw error
  if (!data || !data.is_admin || data.status !== 'approved' || data.deleted_at) {
    return { ok: false, error: '관리자 권한이 없습니다.' }
  }

  return { ok: true, adminId }
}

/** 소급 등록 대상 회원 검색 (이름 또는 전화번호 부분 일치) */
export async function searchBookingUsers(query: string) {
  try {
    const auth = await assertAdmin()
    if (!auth.ok) return { success: false, error: auth.error, users: [] }

    const keyword = query.trim()
    if (keyword.length < 1) return { success: true, users: [] }

    // PostgREST 의 .or() 는 문자열 필터 DSL 이다. 입력을 그대로 끼우면
    // 콤마·괄호·점으로 필터 절을 덧붙이는 주입이 가능하므로 문법 문자를 걷어낸다.
    // (여기까지 오려면 관리자여야 하지만, 검색어가 필터 구조를 바꿀 이유는 없다)
    const safeKeyword = keyword.replace(/[,.()"\\]/g, ' ').trim()
    if (!safeKeyword) return { success: true, users: [] }

    // 전화번호는 숫자만 저장돼 있으므로 하이픈을 넣어 검색해도 걸리도록 정규화한다.
    const digits = keyword.replace(/[^0-9]/g, '')
    const filters = [`name.ilike.%${safeKeyword}%`]
    if (digits.length >= 2) filters.push(`phone.ilike.%${digits}%`)

    const supabase = await createServiceRoleClient()
    const { data, error } = await supabase
      .from('users')
      .select('id, name, phone, household, is_resident')
      .eq('status', 'approved')
      .is('deleted_at', null)
      .or(filters.join(','))
      .order('name')
      .limit(20)

    if (error) throw error
    return { success: true, users: data ?? [] }
  } catch (error: any) {
    console.error('❌ searchBookingUsers error:', error)
    return { success: false, error: error.message, users: [] }
  }
}

/**
 * 저장 없이 과금만 미리 계산한다.
 *
 * 실제 등록과 같은 조회·같은 계산식을 타므로, 화면에 보여준 금액과
 * 저장되는 금액이 갈라지지 않는다.
 */
export async function previewAdminBooking(params: {
  bookingDate: string
  times: string[]
  space: 'nolter' | 'soundroom'
  userId?: string
}) {
  try {
    const auth = await assertAdmin()
    if (!auth.ok) return { success: false, error: auth.error }

    const serviceSupabase = await createServiceRoleClient()
    const result = await previewBookingCharge({
      serviceSupabase,
      input: {
        bookingDate: params.bookingDate,
        times: params.times,
        space: params.space,
        userId: params.userId || undefined,
      },
    })

    if (!result.success) return { success: false, error: result.error }

    return {
      success: true,
      summary: result.summary,
      charge: {
        totalHours: result.charge.totalHours,
        freeHours: result.charge.freeHours,
        prepaidHours: result.charge.prepaidHours,
        regularHours: result.charge.regularHours,
        amount: result.charge.amount,
        paymentMethod: result.charge.paymentMethod,
        freeHoursRemainingAfter: result.charge.freeHoursRemainingAfter,
        usesUnlimitedFree: result.charge.usesUnlimitedFree,
      },
      userKind: result.actor.userKind,
      startTime: result.slots.startTime,
      endTime: result.slots.endTime,
    }
  } catch (error: any) {
    console.error('❌ previewAdminBooking error:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 소급 등록 실행.
 *
 * 회원 건이면 이름·전화번호는 클라이언트 값을 믿지 않고 users 에서 다시 읽는다
 * (선불권이 걸린 예약이 엉뚱한 사람 이름으로 남는 것을 막는다).
 */
export async function createBookingAdmin(params: {
  bookingDate: string
  times: string[]
  space: 'nolter' | 'soundroom'
  userId?: string
  /** 비회원 건일 때만 사용한다. 회원 건은 DB 값으로 덮어쓴다. */
  name?: string
  phone?: string
  note?: string
}) {
  try {
    const auth = await assertAdmin()
    if (!auth.ok) return { success: false, error: auth.error }
    const adminId = auth.adminId

    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.bookingDate)) {
      return { success: false, error: '날짜 형식이 올바르지 않습니다.' }
    }
    if (!Array.isArray(params.times) || params.times.length === 0) {
      return { success: false, error: '시간을 선택해주세요.' }
    }

    // 소급 등록은 '이미 지난 사용분'만 대상이다. 미래 날짜를 허용하면
    // autoCancelUnpaid 가 소급분을 건너뛰는 것과 맞물려, 유료 미입금 건이
    // 취소도 안 되고 안내도 안 되는 채로 슬롯을 무기한 점유한다.
    // 정상적인 미래 예약은 사용자 예약 화면으로 받아야 한다.
    if (params.bookingDate > getKstNow().dateStr) {
      return {
        success: false,
        error: '소급 등록은 오늘 이전 날짜만 가능합니다. 앞으로의 예약은 예약 화면에서 진행해주세요.',
      }
    }

    const serviceSupabase = await createServiceRoleClient()

    let name = (params.name ?? '').trim()
    let phone = (params.phone ?? '').replace(/[^0-9]/g, '')

    if (params.userId) {
      // 검색 목록과 같은 조건을 다시 건다. 액션을 직접 호출하면 탈퇴·미승인 회원
      // 명의로 예약이 생기고 그 사람의 선불권이 차감될 수 있다.
      const { data: user, error } = await serviceSupabase
        .from('users')
        .select('id, name, phone')
        .eq('id', params.userId)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .maybeSingle()

      if (error) throw error
      if (!user) return { success: false, error: '승인된 회원 정보를 찾을 수 없습니다.' }

      name = user.name
      phone = (user.phone ?? '').replace(/[^0-9]/g, '')
    }

    if (!name) return { success: false, error: '이름을 입력해주세요.' }
    if (!phone) return { success: false, error: '전화번호를 입력해주세요.' }

    const result = await createBookingCore({
      serviceSupabase,
      input: {
        bookingDate: params.bookingDate,
        times: params.times,
        space: params.space,
        name,
        phone,
        userId: params.userId || undefined,
        // 회원 건은 공개 예약과 같은 규칙(코어 기본값)을 그대로 따른다.
        // 비회원 건은 관리자가 대신 남기는 기록이라 동의 절차 자체가 없었으므로 false 다.
        piiConsentGiven: params.userId ? undefined : false,
        createdByAdmin: adminId,
        adminNote: params.note?.trim() || null,
      },
      // 소급 등록에는 당일/과거 가드를 걸지 않는다 — 지난 사용분을 남기는 것이 목적이다.
    })

    if (!result.success) {
      console.error('❌ 소급 등록 실패:', result)
      return { success: false, error: result.error, code: result.code }
    }

    console.log('✅ 소급 등록 완료:', {
      bookingId: result.booking.id,
      adminId,
      charge: result.charge,
    })

    // 예약 확정 문자는 보내지 않는다 (이미 지난 사용분이다).
    // 사용자 화면의 '지난 예약'과 달력은 DB 를 그대로 읽으므로 갱신만 해준다.
    revalidatePath('/')

    return {
      success: true,
      booking: result.booking,
      summary: describeCharge(result.charge!),
    }
  } catch (error: any) {
    console.error('❌ createBookingAdmin error:', error)
    return { success: false, error: error.message }
  }
}
