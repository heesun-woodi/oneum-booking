'use server'

import { supabase } from '@/lib/supabase'
import { createServiceRoleClient } from '@/lib/supabase/server'
import { sendNotification } from '@/lib/notifications/sender'

export async function createInquiry(data: {
  name: string
  phone: string
  content: string
  userId?: string
}) {
  try {
    const normalizedPhone = data.phone.replace(/[^0-9]/g, '')

    const { data: inquiry, error } = await supabase
      .from('inquiries')
      .insert({
        name: data.name,
        phone: normalizedPhone,
        content: data.content,
        user_id: data.userId || null,
      })
      .select()
      .single()

    if (error) throw error

    // 관리자에게 즉시 알림
    await sendNotification({
      type: '6-2',
      phone: process.env.ADMIN_PHONE || '',
      recipientName: '관리자',
      variables: {
        name: data.name,
        phone: data.phone,
        content: data.content.length > 50 ? data.content.slice(0, 50) + '...' : data.content,
        adminUrl: process.env.NEXT_PUBLIC_APP_URL
          ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/inquiry`
          : 'https://oneum.vercel.app/admin/inquiry',
      },
    })

    return { success: true, inquiry }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function getInquiries() {
  try {
    const { data, error } = await supabase
      .from('inquiries')
      .select('id, name, phone, content, answer, answered_at, created_at')
      .order('created_at', { ascending: false })

    if (error) throw error
    return { success: true, data: data || [] }
  } catch (error: any) {
    return { success: false, error: error.message, data: [] }
  }
}

export async function answerInquiry(inquiryId: string, answer: string) {
  try {
    const adminClient = await createServiceRoleClient()

    // 문의자 정보 조회
    const { data: inquiry } = await adminClient
      .from('inquiries')
      .select('name, phone')
      .eq('id', inquiryId)
      .single()

    const { error } = await adminClient
      .from('inquiries')
      .update({
        answer,
        answered_at: new Date().toISOString(),
      })
      .eq('id', inquiryId)

    if (error) throw error

    // 문의자에게 답변 알림
    if (inquiry?.phone) {
      await sendNotification({
        type: '6-3',
        phone: inquiry.phone,
        recipientName: inquiry.name,
        variables: {
          name: inquiry.name,
          inquiryUrl: 'https://oneum.vercel.app/inquiry',
        },
      })
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

export async function deleteInquiry(inquiryId: string) {
  try {
    const adminClient = await createServiceRoleClient()
    const { error } = await adminClient
      .from('inquiries')
      .delete()
      .eq('id', inquiryId)

    if (error) throw error
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
