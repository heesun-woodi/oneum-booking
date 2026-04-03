// Phase 6.5: SQL 직접 배포 스크립트
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import dotenv from 'dotenv'

// __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// .env.local 로드
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function deploySQL() {
  console.log('🚀 SQL 배포 시작...')
  
  // SQL 파일 읽기
  const sqlPath = join(__dirname, '..', 'deploy-fix-user-id.sql')
  const sql = readFileSync(sqlPath, 'utf-8')
  
  console.log('📄 SQL 파일:', sqlPath)
  console.log('📊 SQL 길이:', sql.length, 'bytes')
  
  try {
    // Supabase는 직접 SQL 실행을 지원하지 않으므로
    // PostgREST를 통해 간접 실행
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      },
      body: JSON.stringify({ sql })
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`HTTP ${response.status}: ${error}`)
    }
    
    const result = await response.json()
    console.log('✅ SQL 배포 성공!')
    console.log('📋 결과:', result)
    
  } catch (err) {
    console.error('❌ 배포 실패:', err.message)
    console.log('\n📝 수동 배포 안내:')
    console.log('   1. Supabase Dashboard 열기:')
    console.log(`   https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui/sql/new`)
    console.log('   2. deploy-fix-user-id.sql 파일 내용을 붙여넣기')
    console.log('   3. "Run" 버튼 클릭')
    process.exit(1)
  }
}

deploySQL()
