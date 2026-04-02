#!/usr/bin/env node
// 선불권 차감 안되는 문제 디버깅 스크립트

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// .env.local 파일 읽기
const envContent = readFileSync('.env.local', 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/)
  if (match) {
    envVars[match[1].trim()] = match[2].trim()
  }
})

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = envVars.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugPrepaidIssue() {
  console.log('🔍 선불권 차감 문제 디버깅\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  
  // 1. 최근 예약 확인 (선불권 사용 예약)
  console.log('\n1️⃣ 최근 예약 데이터 확인 (선불권 관련)\n')
  const { data: bookings, error: bookingsError } = await supabase
    .from('bookings')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)
  
  if (bookingsError) {
    console.error('❌ 예약 조회 실패:', bookingsError)
    return
  }
  
  console.log(`총 ${bookings.length}개의 최근 예약:`)
  bookings.forEach(b => {
    console.log(`\n📅 예약 ID: ${b.id}`)
    console.log(`   날짜: ${b.booking_date} ${b.start_time}-${b.end_time}`)
    console.log(`   이름: ${b.name} (${b.phone})`)
    console.log(`   user_id: ${b.user_id || '(없음)'}`)
    console.log(`   payment_method: ${b.payment_method}`)
    console.log(`   prepaid_hours_used: ${b.prepaid_hours_used}`)
    console.log(`   regular_hours: ${b.regular_hours}`)
    console.log(`   amount: ${b.amount}`)
    console.log(`   status: ${b.status}`)
    console.log(`   payment_status: ${b.payment_status}`)
    console.log(`   created_at: ${b.created_at}`)
  })
  
  // 2. 선불권 구매 내역 확인
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n2️⃣ 선불권 구매 내역\n')
  const { data: purchases, error: purchasesError } = await supabase
    .from('prepaid_purchases')
    .select('*')
    .order('created_at', { ascending: false })
  
  if (purchasesError) {
    console.error('❌ 선불권 조회 실패:', purchasesError)
    return
  }
  
  console.log(`총 ${purchases.length}개의 선불권:`)
  purchases.forEach(p => {
    console.log(`\n🎫 선불권 ID: ${p.id}`)
    console.log(`   user_id: ${p.user_id}`)
    console.log(`   total_hours: ${p.total_hours}`)
    console.log(`   remaining_hours: ${p.remaining_hours} ⬅️ 잔여`)
    console.log(`   expires_at: ${p.expires_at}`)
    console.log(`   status: ${p.status}`)
    console.log(`   created_at: ${p.created_at}`)
  })
  
  // 3. 선불권 사용 내역 확인
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n3️⃣ 선불권 사용 내역\n')
  const { data: usages, error: usagesError } = await supabase
    .from('prepaid_usages')
    .select('*')
    .order('used_at', { ascending: false })
  
  if (usagesError) {
    console.error('❌ 사용 내역 조회 실패:', usagesError)
    return
  }
  
  if (usages.length === 0) {
    console.log('⚠️  선불권 사용 내역이 없습니다!')
    console.log('   → RPC 함수가 실제로 호출되지 않았거나, deductionPlan이 비어 있었을 가능성')
  } else {
    console.log(`총 ${usages.length}개의 사용 내역:`)
    usages.forEach(u => {
      console.log(`\n📊 사용 ID: ${u.id}`)
      console.log(`   purchase_id: ${u.purchase_id}`)
      console.log(`   booking_id: ${u.booking_id}`)
      console.log(`   hours_used: ${u.hours_used}`)
      console.log(`   used_at: ${u.used_at}`)
    })
  }
  
  // 4. 분석 및 결론
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('\n4️⃣ 문제 분석\n')
  
  const prepaidBookings = bookings.filter(b => 
    b.payment_method === 'prepaid' || b.payment_method === 'mixed'
  )
  
  if (prepaidBookings.length === 0) {
    console.log('⚠️  선불권 사용 예약이 없습니다.')
    console.log('   원인 가능성:')
    console.log('   1. userId가 전달되지 않음 → input.userId 확인 필요')
    console.log('   2. 선불권이 만료되었거나 remaining_hours = 0')
    console.log('   3. 예약 날짜가 선불권 만료일 이후')
  } else {
    console.log(`✅ 선불권 사용 예약 ${prepaidBookings.length}건 발견`)
    
    prepaidBookings.forEach(b => {
      console.log(`\n📌 예약 ${b.id}:`)
      console.log(`   prepaid_hours_used: ${b.prepaid_hours_used}`)
      
      const matchingUsage = usages.find(u => u.booking_id === b.id)
      if (!matchingUsage) {
        console.log('   ❌ 사용 내역 없음 → RPC 차감 실패!')
      } else {
        console.log(`   ✅ 사용 내역 존재 (${matchingUsage.hours_used}시간 차감)`)
      }
    })
  }
  
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

debugPrepaidIssue()
