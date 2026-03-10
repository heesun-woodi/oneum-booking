'use server'

import { createClient } from '@/lib/supabase/server'

export async function getAdminBookings(options: {
  status?: string
  startDate?: string
  endDate?: string
  household?: string
  space?: string
  limit?: number
} = {}) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('bookings')
      .select('*')
      .order('date', { ascending: false })
    
    if (options.status) {
      query = query.eq('status', options.status)
    }
    
    if (options.startDate) {
      query = query.gte('date', options.startDate)
    }
    
    if (options.endDate) {
      query = query.lte('date', options.endDate)
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
    
    const { data, error } = await query
    
    if (error) {
      return { success: false, error: error.message, bookings: [] }
    }
    
    return { success: true, bookings: data || [] }
  } catch (error) {
    console.error('Get admin bookings error:', error)
    return { success: false, error: '조회 중 오류가 발생했습니다.', bookings: [] }
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
