#!/usr/bin/env node
// RPC 함수 존재 여부 확인 스크립트

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
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl)
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkRPCFunctions() {
  console.log('🔍 RPC 함수 존재 여부 확인 중...\n')
  
  // 1. create_booking_with_prepaid 함수 테스트
  console.log('1️⃣ create_booking_with_prepaid 함수 확인...')
  const { data: createData, error: createError } = await supabase.rpc(
    'create_booking_with_prepaid',
    {
      p_booking_data: {
        bookingDate: '2026-04-10',
        startTime: '14:00',
        endTime: '16:00',
        space: 'nolter',
        memberType: 'non-member',
        household: '',
        name: 'TEST',
        phone: '01012345678',
        userId: '',
        prepaidHoursUsed: 0,
        regularHours: 2,
        paymentMethod: 'regular',
        amount: 28000
      },
      p_deduction_plan: []
    }
  )
  
  if (createError) {
    if (createError.message.includes('function') && createError.message.includes('does not exist')) {
      console.log('❌ create_booking_with_prepaid 함수가 존재하지 않습니다!')
      console.log('   마이그레이션 실행 필요\n')
    } else {
      console.log('⚠️ 함수는 존재하지만 테스트 실행 실패:', createError.message)
      console.log('   (함수 존재 확인됨)\n')
    }
  } else {
    console.log('✅ create_booking_with_prepaid 함수 존재 및 실행 가능')
    console.log('   테스트 결과:', createData)
    
    // 테스트 데이터 삭제
    if (createData?.success && createData?.bookingId) {
      await supabase.from('bookings').delete().eq('id', createData.bookingId)
      console.log('   (테스트 예약 삭제 완료)\n')
    }
  }
  
  // 2. cancel_booking_restore_prepaid 함수 테스트
  console.log('2️⃣ cancel_booking_restore_prepaid 함수 확인...')
  const { data: cancelData, error: cancelError } = await supabase.rpc(
    'cancel_booking_restore_prepaid',
    {
      p_booking_id: '00000000-0000-0000-0000-000000000000' // 존재하지 않는 ID
    }
  )
  
  if (cancelError) {
    if (cancelError.message.includes('function') && cancelError.message.includes('does not exist')) {
      console.log('❌ cancel_booking_restore_prepaid 함수가 존재하지 않습니다!')
      console.log('   마이그레이션 실행 필요\n')
    } else {
      console.log('⚠️ 함수는 존재하지만 테스트 실행 실패:', cancelError.message)
      console.log('   (함수 존재 확인됨)\n')
    }
  } else {
    console.log('✅ cancel_booking_restore_prepaid 함수 존재 및 실행 가능')
    console.log('   테스트 결과:', cancelData, '\n')
  }
  
  // 3. 결론
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  if ((createError?.message.includes('does not exist')) || 
      (cancelError?.message.includes('does not exist'))) {
    console.log('🚨 마이그레이션 실행이 필요합니다!')
    console.log('\n📋 실행 방법:')
    console.log('1. Supabase Dashboard 접속')
    console.log('   https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui/sql/new')
    console.log('\n2. SQL Editor에서 실행:')
    console.log('   phase65-migration-combined.sql 전체 내용 복사 → 붙여넣기 → Run')
  } else {
    console.log('✅ 모든 RPC 함수가 정상적으로 배포되었습니다!')
  }
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}

checkRPCFunctions()
