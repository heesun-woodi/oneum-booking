'use server'

import { createServiceRoleClient } from '@/lib/supabase/server'

export interface UsageCount {
  household: string
  space: 'nolter' | 'soundroom'
  month: string
  count: number
  cancelledSameDay: number
  effectiveCount: number
  /** 예약된 총 시간 (migration 031에서 monthly_usage 뷰에 추가) */
  bookedHours: number
  /** 무료 한도에서 차감된 시간 (놀터만 해당) */
  freeHours: number
}

/**
 * 세대별 월별 이용 횟수 조회
 */
export async function getMonthlyUsage(
  household: string,
  month?: string // YYYY-MM, 기본값 현재 월
): Promise<{
  success: boolean
  usage: UsageCount[]
  error?: string
}> {
  try {
    const supabase = await createServiceRoleClient()
    const targetMonth = month || new Date().toISOString().substring(0, 7)

    // 월별 이용 횟수 조회
    const { data: usageData, error: usageError } = await supabase
      .from('monthly_usage')
      .select('*')
      .eq('household', household)
      .gte('month', `${targetMonth}-01`)
      .lt('month', `${getNextMonth(targetMonth)}-01`)

    if (usageError) {
      return { success: false, usage: [], error: usageError.message }
    }

    // 당일 취소 횟수 조회
    const { data: cancelledData, error: cancelledError } = await supabase
      .from('cancelled_same_day')
      .select('*')
      .eq('household', household)
      .gte('month', `${targetMonth}-01`)
      .lt('month', `${getNextMonth(targetMonth)}-01`)

    if (cancelledError) {
      return { success: false, usage: [], error: cancelledError.message }
    }

    // 결합
    const usageMap = new Map<string, UsageCount>()

    usageData?.forEach((u: any) => {
      const key = `${u.household}-${u.space}`
      usageMap.set(key, {
        household: u.household,
        space: u.space,
        month: targetMonth,
        count: u.usage_count,
        cancelledSameDay: 0,
        effectiveCount: u.usage_count,
        bookedHours: Number(u.booked_hours ?? 0),
        freeHours: Number(u.free_hours ?? 0),
      })
    })

    cancelledData?.forEach((c: any) => {
      const key = `${c.household}-${c.space}`
      const existing = usageMap.get(key)
      if (existing) {
        existing.cancelledSameDay = c.cancelled_count
        existing.effectiveCount = existing.count + c.cancelled_count
      }
    })

    return {
      success: true,
      usage: Array.from(usageMap.values()),
    }
  } catch (error: any) {
    console.error('이용 횟수 조회 실패:', error)
    return { success: false, usage: [], error: error.message }
  }
}

/**
 * 다음 달 계산 (YYYY-MM → YYYY-MM)
 */
function getNextMonth(month: string): string {
  const [year, mon] = month.split('-').map(Number)
  if (mon === 12) {
    return `${year + 1}-01`
  } else {
    return `${year}-${String(mon + 1).padStart(2, '0')}`
  }
}
