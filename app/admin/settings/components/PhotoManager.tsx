'use client'

import { useState, useEffect } from 'react'
import {
  getSpacePhotos,
  uploadSpacePhoto,
  replaceSpacePhoto,
  deleteSpacePhoto,
  type SpacePhoto
} from '@/app/actions/space-photos'
import { PhotoCard } from './PhotoCard'
import { PhotoUploader } from './PhotoUploader'

const SPACE_LABELS = {
  nolter: { emoji: '🏠', name: '놀터' },
  soundroom: { emoji: '🎵', name: '방음실' }
}

export function PhotoManager() {
  const [selectedSpace, setSelectedSpace] = useState<'nolter' | 'soundroom'>('nolter')
  const [photos, setPhotos] = useState<SpacePhoto[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 사진 로드
  const loadPhotos = async () => {
    setIsLoading(true)
    setError(null)

    const result = await getSpacePhotos(selectedSpace)

    if (result.success) {
      setPhotos(result.photos)
    } else {
      setError(result.error)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    loadPhotos()
  }, [selectedSpace])

  // 성공/에러 메시지 자동 숨김
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(null), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  // 이미지 크기 추출
  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image()
      img.onload = () => {
        resolve({ width: img.width, height: img.height })
      }
      img.onerror = reject
      img.src = URL.createObjectURL(file)
    })
  }

  // HEIC → JPEG 변환
  const convertHeicToJpeg = async (file: File): Promise<File> => {
    const name = file.name.toLowerCase()
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif'
      || name.endsWith('.heic') || name.endsWith('.heif')
    if (!isHeic) return file

    try {
      const mod = await import('heic2any')
      // UMD 모듈 호환: .default 또는 모듈 자체가 함수일 수 있음
      type Heic2AnyFn = typeof import('heic2any').default
      const modAsAny = mod as { default?: Heic2AnyFn } & Heic2AnyFn
      const heic2anyFn: Heic2AnyFn = modAsAny.default ?? modAsAny
      const result = await heic2anyFn({ blob: file, toType: 'image/jpeg', quality: 0.85 })
      const blob = Array.isArray(result) ? result[0] : result
      const newName = file.name.replace(/\.(heic|heif)$/i, '.jpg')
      return new File([blob], newName, { type: 'image/jpeg' })
    } catch (err) {
      console.error('HEIC 변환 실패:', err)
      throw new Error('HEIC 파일 변환에 실패했습니다. 사진 앱에서 JPG로 내보낸 후 다시 시도해주세요.')
    }
  }

  // 파일 클라이언트 검증
  const validateFileClient = (file: File): string | null => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    const isHeicByName = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')
    if (!allowed.includes(file.type) && !isHeicByName) {
      return 'JPG, PNG, WebP, HEIC 파일만 업로드 가능합니다.'
    }
    if (file.size > 20 * 1024 * 1024) {
      return '파일 크기는 20MB 이하여야 합니다.'
    }
    return null
  }

  // 업로드 핸들러
  const handleUpload = async (file: File) => {
    const clientError = validateFileClient(file)
    if (clientError) {
      setError(clientError)
      return
    }

    setIsUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const convertedFile = await convertHeicToJpeg(file)

      let width = 0
      let height = 0
      try {
        const dimensions = await getImageDimensions(convertedFile)
        width = dimensions.width
        height = dimensions.height
      } catch {
        // 이미지 크기 추출 실패해도 업로드는 진행
      }

      const formData = new FormData()
      formData.append('file', convertedFile)
      formData.append('space', selectedSpace)
      formData.append('width', width.toString())
      formData.append('height', height.toString())

      const result = await uploadSpacePhoto(formData)

      if (!result) {
        setError('서버 오류가 발생했습니다. 다시 시도해주세요.')
      } else if (result.success) {
        setSuccess('사진이 업로드되었습니다.')
        loadPhotos()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '업로드 중 오류가 발생했습니다.')
    }

    setIsUploading(false)
  }

  // 교체 핸들러
  const handleReplace = async (photoId: string, file: File) => {
    const clientError = validateFileClient(file)
    if (clientError) {
      setError(clientError)
      return
    }

    setError(null)
    setSuccess(null)

    try {
      const convertedFile = await convertHeicToJpeg(file)

      let width = 0
      let height = 0
      try {
        const dimensions = await getImageDimensions(convertedFile)
        width = dimensions.width
        height = dimensions.height
      } catch {
        // 이미지 크기 추출 실패해도 교체는 진행
      }

      const formData = new FormData()
      formData.append('file', convertedFile)
      formData.append('width', width.toString())
      formData.append('height', height.toString())

      const result = await replaceSpacePhoto(photoId, formData)

      if (!result) {
        setError('서버 오류가 발생했습니다. 다시 시도해주세요.')
      } else if (result.success) {
        setSuccess('사진이 교체되었습니다.')
        loadPhotos()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '교체 중 오류가 발생했습니다.')
    }
  }

  // 삭제 핸들러
  const handleDelete = async (photoId: string, fileName: string) => {
    if (!confirm(`"${fileName}" 사진을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`)) {
      return
    }

    setError(null)
    setSuccess(null)

    const result = await deleteSpacePhoto(photoId)

    if (result.success) {
      setSuccess('사진이 삭제되었습니다.')
      loadPhotos()
    } else {
      setError(result.error)
    }
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border">
      <h2 className="text-xl font-semibold mb-4">📷 공간 사진 관리</h2>

      {/* 공간 탭 */}
      <div className="flex gap-2 mb-6">
        {(Object.keys(SPACE_LABELS) as Array<keyof typeof SPACE_LABELS>).map(space => (
          <button
            key={space}
            onClick={() => setSelectedSpace(space)}
            className={`
              px-4 py-2 rounded-lg font-medium transition-all
              ${selectedSpace === space
                ? space === 'nolter'
                  ? 'bg-blue-500 text-white shadow-md'
                  : 'bg-purple-500 text-white shadow-md'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }
            `}
          >
            {SPACE_LABELS[space].emoji} {SPACE_LABELS[space].name}
          </button>
        ))}
      </div>

      {/* 알림 메시지 */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg flex items-start gap-2">
          <span className="text-lg">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg flex items-start gap-2">
          <span className="text-lg">✅</span>
          <span>{success}</span>
        </div>
      )}

      {/* 로딩 상태 */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="aspect-square bg-gray-100 rounded-lg animate-pulse"></div>
          ))}
        </div>
      ) : (
        <>
          {/* 사진 그리드 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {photos.map(photo => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                onReplace={(file) => handleReplace(photo.id, file)}
                onDelete={() => handleDelete(photo.id, photo.file_name)}
              />
            ))}

            {/* 업로더 (10장 미만일 때) */}
            {photos.length < 10 && (
              <PhotoUploader
                onUpload={handleUpload}
                isUploading={isUploading}
              />
            )}
          </div>

          {/* 안내 메시지 */}
          <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
            <span>{photos.length}/10장 업로드됨</span>
            <span>💡 권장: 16:9 또는 4:3 비율, 800x600px 이상</span>
          </div>
        </>
      )}
    </div>
  )
}
