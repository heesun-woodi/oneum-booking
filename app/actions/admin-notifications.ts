'use server'

import { createClient } from '@/lib/supabase/server'

export async function getNotificationLogs(options: {
  messageType?: string
  status?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
} = {}) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('notification_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
    
    if (options.messageType) {
      query = query.eq('message_type', options.messageType)
    }
    
    if (options.status) {
      query = query.eq('status', options.status)
    }
    
    if (options.startDate) {
      query = query.gte('created_at', options.startDate)
    }
    
    if (options.endDate) {
      query = query.lte('created_at', options.endDate)
    }
    
    if (options.limit) {
      query = query.limit(options.limit)
    }
    
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1)
    }
    
    const { data, error, count } = await query
    
    if (error) {
      return { success: false, error: error.message, logs: [], total: 0 }
    }
    
    return { success: true, logs: data || [], total: count || 0 }
  } catch (error: any) {
    console.error('Get notification logs error:', error)
    return { success: false, error: error.message, logs: [], total: 0 }
  }
}

export async function getNotificationStats(month?: string) {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('notification_logs')
      .select('message_type, status, created_at')
    
    if (month) {
      const [year, monthNum] = month.split('-')
      const startDate = `${year}-${monthNum}-01`
      const lastDay = new Date(parseInt(year), parseInt(monthNum), 0).getDate()
      const endDate = `${year}-${monthNum}-${String(lastDay).padStart(2, '0')} 23:59:59`
      
      query = query.gte('created_at', startDate).lte('created_at', endDate)
    }
    
    const { data, error } = await query
    
    if (error) throw error
    
    const total = data?.length || 0
    const sent = data?.filter(log => log.status === 'sent').length || 0
    const failed = data?.filter(log => log.status === 'failed').length || 0
    const pending = data?.filter(log => log.status === 'pending').length || 0
    
    // 성공률
    const successRate = total > 0 ? ((sent / total) * 100).toFixed(1) : '0.0'
    
    // 타입별 집계
    const typeMap = new Map<string, number>()
    data?.forEach(log => {
      if (log.status === 'sent') {
        typeMap.set(log.message_type, (typeMap.get(log.message_type) || 0) + 1)
      }
    })
    
    const typeStats = Array.from(typeMap.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
    
    return {
      success: true,
      stats: {
        total,
        sent,
        failed,
        pending,
        successRate,
        typeStats,
      }
    }
  } catch (error: any) {
    console.error('Get notification stats error:', error)
    return { success: false, error: error.message, stats: null }
  }
}
