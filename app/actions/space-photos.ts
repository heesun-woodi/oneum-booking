'use server'

import { createClient, createServiceRoleClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// ===== 타입 정의 =====
export interface SpacePhoto {
  id: string
  space: 'nolter' | 'soundroom'
  file_name: string
  storage_path: string
  file_size: number
  mime_type: string
  width: number | null
  height: number | null
  display_order: number
  alt_text: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  url?: string  // 클라이언트용 공개 URL
}

export type SpacePhotoResult = {
  success: true
  photos: SpacePhoto[]
} | {
  success: false
  error: string
}

export type UploadPhotoResult = {
  success: true
  photo: SpacePhoto
} | {
  success: false
  error: string
}

export type ActionResult = {
  success: true
} | {
  success: false
  error: string
}

// ===== 유효성 검증 =====
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_FILE_SIZE = 5 * 1024 * 1024  // 5MB
const MAX_PHOTOS_PER_SPACE = 10

function validateFile(file: File): string | null {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'JPG, PNG, WebP 파일만 업로드 가능합니다.'
  }
  
  if (file.size > MAX_FILE_SIZE) {
    return '파일 크기는 5MB 이하여야 합니다.'
  }
  
  return null
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 50)
}

// ===== 1. 공간별 사진 목록 조회 =====
export async function getSpacePhotos(space: 'nolter' | 'soundroom'): Promise<SpacePhotoResult> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('space_photos')
      .select('*')
      .eq('space', space)
      .eq('is_active', true)
      .order('display_order', { ascending: true })
    
    if (error) {
      console.error('Failed to fetch space photos:', error)
      return { success: false, error: error.message }
    }
    
    // Storage 공개 URL 생성
    const photos = (data || []).map(photo => ({
      ...photo,
      url: supabase.storage
        .from('space-photos')
        .getPublicUrl(photo.storage_path)
        .data.publicUrl
    }))
    
    return { success: true, photos }
  } catch (error) {
    console.error('Exception in getSpacePhotos:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '사진 조회 실패' 
    }
  }
}

// ===== 2. 사진 업로드 =====
export async function uploadSpacePhoto(formData: FormData): Promise<UploadPhotoResult> {
  try {
    const supabase = await createServiceRoleClient()
    
    // FormData 파싱
    const file = formData.get('file') as File
    const space = formData.get('space') as 'nolter' | 'soundroom'
    const altText = formData.get('altText') as string | null
    const width = formData.get('width') ? parseInt(formData.get('width') as string) : null
    const height = formData.get('height') ? parseInt(formData.get('height') as string) : null
    
    // 필수 데이터 검증
    if (!file || !space) {
      return { success: false, error: '필수 데이터가 누락되었습니다.' }
    }
    
    if (!['nolter', 'soundroom'].includes(space)) {
      return { success: false, error: '잘못된 공간 타입입니다.' }
    }
    
    // 파일 유효성 검증
    const validationError = validateFile(file)
    if (validationError) {
      return { success: false, error: validationError }
    }
    
    // 현재 사진 개수 확인
    const { count, error: countError } = await supabase
      .from('space_photos')
      .select('*', { count: 'exact', head: true })
      .eq('space', space)
      .eq('is_active', true)
    
    if (countError) {
      console.error('Failed to count photos:', countError)
      return { success: false, error: '사진 개수 확인 실패' }
    }
    
    if (count && count >= MAX_PHOTOS_PER_SPACE) {
      return { success: false, error: `공간당 최대 ${MAX_PHOTOS_PER_SPACE}장까지만 업로드 가능합니다.` }
    }
    
    // Storage 경로 생성
    const timestamp = Date.now()
    const ext = file.name.split('.').pop() || 'jpg'
    const sanitizedName = sanitizeFilename(file.name.replace(`.${ext}`, ''))
    const storagePath = `${space}/${timestamp}_${sanitizedName}.${ext}`
    
    // Storage 업로드
    const { error: uploadError } = await supabase.storage
      .from('space-photos')
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) {
      console.error('Storage upload failed:', uploadError)
      return { success: false, error: '파일 업로드 실패: ' + uploadError.message }
    }
    
    // 최대 display_order 조회
    const { data: maxOrderData } = await supabase
      .from('space_photos')
      .select('display_order')
      .eq('space', space)
      .order('display_order', { ascending: false })
      .limit(1)
      .maybeSingle()
    
    const newOrder = (maxOrderData?.display_order ?? -1) + 1
    
    // DB 저장
    const { data, error: dbError } = await supabase
      .from('space_photos')
      .insert({
        space,
        file_name: file.name,
        storage_path: storagePath,
        file_size: file.size,
        mime_type: file.type,
        width,
        height,
        display_order: newOrder,
        alt_text: altText
      })
      .select()
      .single()
    
    if (dbError) {
      console.error('DB insert failed:', dbError)
      // 롤백: Storage 파일 삭제
      await supabase.storage.from('space-photos').remove([storagePath])
      return { success: false, error: 'DB 저장 실패: ' + dbError.message }
    }
    
    // 공개 URL 추가
    const photoWithUrl = {
      ...data,
      url: supabase.storage
        .from('space-photos')
        .getPublicUrl(storagePath)
        .data.publicUrl
    }
    
    // 캐시 무효화
    revalidatePath('/')
    revalidatePath('/admin/settings')
    
    return { success: true, photo: photoWithUrl }
  } catch (error) {
    console.error('Exception in uploadSpacePhoto:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '업로드 실패' 
    }
  }
}

// ===== 3. 사진 교체 =====
export async function replaceSpacePhoto(photoId: string, formData: FormData): Promise<UploadPhotoResult> {
  try {
    const supabase = await createServiceRoleClient()
    
    // 기존 사진 정보 조회
    const { data: existing, error: fetchError } = await supabase
      .from('space_photos')
      .select('*')
      .eq('id', photoId)
      .single()
    
    if (fetchError || !existing) {
      return { success: false, error: '사진을 찾을 수 없습니다.' }
    }
    
    const file = formData.get('file') as File
    
    if (!file) {
      return { success: false, error: '파일이 없습니다.' }
    }
    
    // 파일 유효성 검증
    const validationError = validateFile(file)
    if (validationError) {
      return { success: false, error: validationError }
    }
    
    // 새 Storage 경로 생성
    const timestamp = Date.now()
    const ext = file.name.split('.').pop() || 'jpg'
    const sanitizedName = sanitizeFilename(file.name.replace(`.${ext}`, ''))
    const newStoragePath = `${existing.space}/${timestamp}_${sanitizedName}.${ext}`
    
    // 새 파일 업로드
    const { error: uploadError } = await supabase.storage
      .from('space-photos')
      .upload(newStoragePath, file, {
        cacheControl: '3600',
        upsert: false
      })
    
    if (uploadError) {
      console.error('Storage upload failed:', uploadError)
      return { success: false, error: '파일 업로드 실패: ' + uploadError.message }
    }
    
    // DB 업데이트
    const width = formData.get('width') ? parseInt(formData.get('width') as string) : null
    const height = formData.get('height') ? parseInt(formData.get('height') as string) : null
    const altText = formData.get('altText') as string | null
    
    const { data: updated, error: updateError } = await supabase
      .from('space_photos')
      .update({
        file_name: file.name,
        storage_path: newStoragePath,
        file_size: file.size,
        mime_type: file.type,
        width,
        height,
        alt_text: altText || existing.alt_text
      })
      .eq('id', photoId)
      .select()
      .single()
    
    if (updateError) {
      console.error('DB update failed:', updateError)
      // 롤백: 새 파일 삭제
      await supabase.storage.from('space-photos').remove([newStoragePath])
      return { success: false, error: 'DB 업데이트 실패: ' + updateError.message }
    }
    
    // 기존 파일 삭제
    await supabase.storage.from('space-photos').remove([existing.storage_path])
    
    // 공개 URL 추가
    const photoWithUrl = {
      ...updated,
      url: supabase.storage
        .from('space-photos')
        .getPublicUrl(newStoragePath)
        .data.publicUrl
    }
    
    // 캐시 무효화
    revalidatePath('/')
    revalidatePath('/admin/settings')
    
    return { success: true, photo: photoWithUrl }
  } catch (error) {
    console.error('Exception in replaceSpacePhoto:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '교체 실패' 
    }
  }
}

// ===== 4. 사진 삭제 =====
export async function deleteSpacePhoto(photoId: string): Promise<ActionResult> {
  try {
    const supabase = await createServiceRoleClient()
    
    // 기존 사진 정보 조회
    const { data: existing, error: fetchError } = await supabase
      .from('space_photos')
      .select('storage_path')
      .eq('id', photoId)
      .single()
    
    if (fetchError || !existing) {
      return { success: false, error: '사진을 찾을 수 없습니다.' }
    }
    
    // Storage에서 삭제
    const { error: storageError } = await supabase.storage
      .from('space-photos')
      .remove([existing.storage_path])
    
    if (storageError) {
      console.error('Storage deletion failed:', storageError)
      // Storage 실패해도 DB는 삭제 진행 (orphan 방지)
    }
    
    // DB에서 삭제
    const { error: dbError } = await supabase
      .from('space_photos')
      .delete()
      .eq('id', photoId)
    
    if (dbError) {
      console.error('DB deletion failed:', dbError)
      return { success: false, error: 'DB 삭제 실패: ' + dbError.message }
    }
    
    // 캐시 무효화
    revalidatePath('/')
    revalidatePath('/admin/settings')
    
    return { success: true }
  } catch (error) {
    console.error('Exception in deleteSpacePhoto:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '삭제 실패' 
    }
  }
}

// ===== 5. 사진 순서 변경 (Phase 2) =====
export async function updatePhotoOrder(space: 'nolter' | 'soundroom', orderedIds: string[]): Promise<ActionResult> {
  try {
    const supabase = await createClient()
    
    // 각 사진의 display_order 업데이트
    const updates = orderedIds.map((id, index) => 
      supabase
        .from('space_photos')
        .update({ display_order: index })
        .eq('id', id)
        .eq('space', space)
    )
    
    const results = await Promise.all(updates)
    const hasError = results.some(r => r.error)
    
    if (hasError) {
      console.error('Some updates failed:', results.filter(r => r.error))
      return { success: false, error: '순서 변경 중 오류 발생' }
    }
    
    // 캐시 무효화
    revalidatePath('/')
    revalidatePath('/admin/settings')
    
    return { success: true }
  } catch (error) {
    console.error('Exception in updatePhotoOrder:', error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : '순서 변경 실패' 
    }
  }
}
