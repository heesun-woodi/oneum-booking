import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const auth = request.headers.get('Authorization')
  if (auth !== 'Bearer oneum-cleanup-2026') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createServiceRoleClient()

  // 1. prepaid_usages 먼저 삭제 (FK 제약)
  const { error: e1 } = await supabase.from('prepaid_usages').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  // 2. bookings 삭제
  const { error: e2 } = await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  // 3. prepaid_purchases 삭제
  const { error: e3 } = await supabase.from('prepaid_purchases').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  // 4. 우디(관리자) 제외 users 삭제
  const { error: e4 } = await supabase.from('users').delete().neq('name', '우디')

  const errors = [e1, e2, e3, e4].filter(Boolean)
  if (errors.length > 0) {
    return NextResponse.json({ success: false, errors: errors.map(e => e?.message) })
  }

  return NextResponse.json({ success: true, message: '테스트 데이터 삭제 완료' })
}
