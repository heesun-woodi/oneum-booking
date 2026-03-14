'use server'

import { supabase } from '@/lib/supabase'

export interface UsageCount {
  household: string
  space: 'nolter' | 'soundroom'
  month: string
  count: number
  cancelledSameDay: number
  effectiveCount: number
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
 * 전체 세대 이용 현황 (관리자용)
 */
export async function getAllHouseholdUsage(
  month?: string
): Promise<{
  success: boolean
  usages: UsageCount[]
  error?: string
}> {
  try {
    const targetMonth = month || new Date().toISOString().substring(0, 7)

    // 전체 세대 이용 횟수 조회
    const { data: usageData, error: usageError } = await supabase
      .from('monthly_usage')
      .select('*')
      .gte('month', `${targetMonth}-01`)
      .lt('month', `${getNextMonth(targetMonth)}-01`)
      .order('household', { ascending: true })

    if (usageError) {
      return { success: false, usages: [], error: usageError.message }
    }

    // 당일 취소 횟수 조회
    const { data: cancelledData, error: cancelledError } = await supabase
      .from('cancelled_same_day')
      .select('*')
      .gte('month', `${targetMonth}-01`)
      .lt('month', `${getNextMonth(targetMonth)}-01`)

    if (cancelledError) {
      return { success: false, usages: [], error: cancelledError.message }
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
      usages: Array.from(usageMap.values()),
    }
  } catch (error: any) {
    console.error('전체 이용 현황 조회 실패:', error)
    return { success: false, usages: [], error: error.message }
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
