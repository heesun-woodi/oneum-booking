/**
 * 크론 작업 로깅 래퍼
 */

import { supabase } from '../supabase'

export async function withCronLogging<T>(
  jobName: string,
  handler: () => Promise<T>
): Promise<T> {
  // 작업 시작 로그
  const { data: log, error: logError } = await supabase
    .from('cron_job_logs')
    .insert({ 
      job_name: jobName,
      status: 'running',
    })
    .select()
    .single()

  if (logError) {
    console.error('크론 로그 생성 실패:', logError)
  }

  try {
    const result = await handler()

    // 성공 로그
    if (log) {
      await supabase
        .from('cron_job_logs')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          metadata: result as any,
        })
        .eq('id', log.id)
    }

    return result
  } catch (error: any) {
    // 실패 로그
    if (log) {
      await supabase
        .from('cron_job_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: error.message,
        })
        .eq('id', log.id)
    }

    throw error
  }
}

/**
 * 크론 인증 검증
 */
export function verifyCronAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET

  if (!secret) {
    console.warn('CRON_SECRET not configured')
    return false
  }

  return authHeader === `Bearer ${secret}`
}
