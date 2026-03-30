'use server'

import { createClient } from '@/lib/supabase/server'

// 📊 월별 예약 통계
export async function getMonthlyBookingStats(year: number, month: number) {
  try {
    const supabase = await createClient()
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`
    const lastDay = new Date(year, month, 0).getDate()
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    
    // 전체 통계
    const { data: totalData } = await supabase
      .from('bookings')
      .select('status, space, member_type')
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
    
    const total = totalData?.length || 0
    const confirmed = totalData?.filter(b => b.status === 'confirmed').length || 0
    const cancelled = totalData?.filter(b => b.status === 'cancelled').length || 0
    const pending = totalData?.filter(b => b.status === 'pending').length || 0
    
    // 공간별
    const nolter = totalData?.filter(b => b.space === 'nolter' && b.status === 'confirmed').length || 0
    const soundroom = totalData?.filter(b => b.space === 'soundroom' && b.status === 'confirmed').length || 0
    
    // 회원/비회원
    const member = totalData?.filter(b => b.member_type === 'member' && b.status === 'confirmed').length || 0
    const nonMember = totalData?.filter(b => b.member_type === 'non-member' && b.status === 'confirmed').length || 0
    
    // 취소율
    const cancellationRate = total > 0 ? ((cancelled / total) * 100).toFixed(1) : '0.0'
    
    return {
      success: true,
      stats: {
        total,
        confirmed,
        cancelled,
        pending,
        nolter,
        soundroom,
        member,
        nonMember,
        cancellationRate,
      }
    }
  } catch (error: any) {
    console.error('Get monthly stats error:', error)
    return { success: false, error: error.message, stats: null }
  }
}

// 🏠 세대별 이용 현황
export async function getHouseholdUsageStats(month?: string) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('bookings')
      .select('household, space, booking_date')
      .eq('member_type', 'member')
      .eq('status', 'confirmed')
      .not('household', 'is', null)
    
    if (month) {
      const [year, monthNum] = month.split('-')
      const startDate = `${year}-${monthNum}-01`
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate()
      const endDate = `${year}-${monthNum}-${String(lastDay).padStart(2, '0')}`
      
      query = query.gte('booking_date', startDate).lte('booking_date', endDate)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // 세대별 집계
    const householdMap = new Map<string, { nolter: number, soundroom: number, total: number }>()
    
    data?.forEach(booking => {
      const household = booking.household as string
      if (!householdMap.has(household)) {
        householdMap.set(household, { nolter: 0, soundroom: 0, total: 0 })
      }
      
      const stats = householdMap.get(household)!
      stats.total++
      
      if (booking.space === 'nolter') {
        stats.nolter++
      } else {
        stats.soundroom++
      }
    })
    
    // 배열로 변환 및 정렬
    const households = Array.from(householdMap.entries())
      .map(([household, stats]) => ({
        household,
        ...stats,
      }))
      .sort((a, b) => b.total - a.total)
    
    return { success: true, households }
  } catch (error: any) {
    console.error('Get household usage stats error:', error)
    return { success: false, error: error.message, households: [] }
  }
}

// 📍 공간별 인기 시간대
export async function getSpaceTimeStats(space: 'nolter' | 'soundroom', month?: string) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('bookings')
      .select('start_time, end_time')
      .eq('space', space)
      .eq('status', 'confirmed')
    
    if (month) {
      const [year, monthNum] = month.split('-')
      const startDate = `${year}-${monthNum}-01`
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate()
      const endDate = `${year}-${monthNum}-${String(lastDay).padStart(2, '0')}`
      
      query = query.gte('booking_date', startDate).lte('booking_date', endDate)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    // 시간대별 카운트
    const timeSlots = new Map<string, number>()
    
    data?.forEach(booking => {
      const startHour = parseInt(booking.start_time.split(':')[0])
      const endHour = parseInt(booking.end_time.split(':')[0])
      
      for (let hour = startHour; hour < endHour; hour++) {
        const timeSlot = `${String(hour).padStart(2, '0')}:00`
        timeSlots.set(timeSlot, (timeSlots.get(timeSlot) || 0) + 1)
      }
    })
    
    // 배열로 변환 및 정렬
    const timeStats = Array.from(timeSlots.entries())
      .map(([time, count]) => ({ time, count }))
      .sort((a, b) => {
        const hourA = parseInt(a.time.split(':')[0])
        const hourB = parseInt(b.time.split(':')[0])
        return hourA - hourB
      })
    
    return { success: true, timeStats }
  } catch (error: any) {
    console.error('Get space time stats error:', error)
    return { success: false, error: error.message, timeStats: [] }
  }
}

// 📉 취소율 분석 (월별)
export async function getCancellationStats(year: number) {
  try {
    const supabase = await createClient()
    
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    
    const { data, error } = await supabase
      .from('bookings')
      .select('booking_date, status')
      .gte('booking_date', startDate)
      .lte('booking_date', endDate)
    
    if (error) throw error
    
    // 월별 집계
    const monthlyStats = new Map<number, { total: number, cancelled: number }>()
    
    for (let month = 1; month <= 12; month++) {
      monthlyStats.set(month, { total: 0, cancelled: 0 })
    }
    
    data?.forEach(booking => {
      const month = parseInt(booking.booking_date.split('-')[1])
      const stats = monthlyStats.get(month)!
      
      stats.total++
      if (booking.status === 'cancelled') {
        stats.cancelled++
      }
    })
    
    // 배열로 변환
    const cancellationStats = Array.from(monthlyStats.entries()).map(([month, stats]) => ({
      month,
      total: stats.total,
      cancelled: stats.cancelled,
      rate: stats.total > 0 ? ((stats.cancelled / stats.total) * 100).toFixed(1) : '0.0',
    }))
    
    return { success: true, cancellationStats }
  } catch (error: any) {
    console.error('Get cancellation stats error:', error)
    return { success: false, error: error.message, cancellationStats: [] }
  }
}
