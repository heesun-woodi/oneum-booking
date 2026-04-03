// Phase 6.5: user_id NULL 문제 수정 배포 스크립트
import { createClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function deployRpcFix() {
  console.log('🚀 Deploying RPC function fix...')
  
  // SQL 파일 읽기
  const sqlPath = path.join(process.cwd(), 'deploy-fix-user-id.sql')
  const sql = fs.readFileSync(sqlPath, 'utf-8')
  
  console.log('📄 SQL 파일 로드됨:', sqlPath)
  console.log('📊 SQL 길이:', sql.length, 'bytes')
  
  try {
    // RPC 함수 재배포
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql })
    
    if (error) {
      console.error('❌ 배포 실패:', error)
      throw error
    }
    
    console.log('✅ RPC 함수 배포 성공!')
    console.log('📋 결과:', data)
    
    // 검증: RPC 함수 존재 확인
    console.log('\n🔍 검증 중...')
    const { data: functions, error: funcError } = await supabase.rpc('create_booking_with_prepaid', {
      p_user_id: '00000000-0000-0000-0000-000000000000',
      p_booking_date: '2026-12-31',
      p_start_time: '09:00',
      p_end_time: '10:00',
      p_space: 'nolter',
      p_member_type: 'non-member',
      p_household: null,
      p_name: 'TEST',
      p_phone: '01000000000',
      p_requested_hours: 1
    })
    
    if (funcError && funcError.message.includes('violates check constraint')) {
      console.log('⚠️ 검증 테스트: 함수 존재 확인됨 (제약 조건 위반은 예상됨)')
    } else if (funcError) {
      console.log('⚠️ 검증 경고:', funcError.message)
    } else {
      console.log('✅ RPC 함수 정상 작동!')
    }
    
  } catch (err: any) {
    console.error('💥 오류:', err.message)
    process.exit(1)
  }
}

deployRpcFix()
