'use server'

import { createClient } from '@/utils/supabase/server'
import { revalidatePath } from 'next/cache'

export async function getSetting(key: string): Promise<string | null> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('site_settings')
    .select('value')
    .eq('key', key)
    .single()

  if (error || !data) {
    console.error('Failed to get setting:', error)
    return null
  }

  return data.value
}

export async function updateSetting(key: string, value: string): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()
  
  // First check if it exists
  const { data: existing } = await supabase
    .from('site_settings')
    .select('id')
    .eq('key', key)
    .single()

  let error;

  if (existing) {
    const { error: updateError } = await supabase
      .from('site_settings')
      .update({ value, updated_at: new Date().toISOString() })
      .eq('key', key)
    error = updateError
  } else {
    const { error: insertError } = await supabase
      .from('site_settings')
      .insert({ key, value })
    error = insertError
  }

  if (error) {
    console.error('Failed to update setting:', error)
    return { success: false, error: error.message }
  }

  // Revalidate the home page to reflect the new setting
  revalidatePath('/')
  revalidatePath('/admin/settings')
  
  return { success: true }
}
