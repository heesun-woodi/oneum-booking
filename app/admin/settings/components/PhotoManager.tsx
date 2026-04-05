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

  // 파일 클라이언트 검증
  const validateFileClient = (file: File): string | null => {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowed.includes(file.type)) {
      return 'JPG, PNG, WebP 파일만 업로드 가능합니다. (iPhone HEIC 파일은 카메라 설정에서 "가장 호환성 높은" 포맷으로 변경 후 촬영하거나, 사진 앱에서 공유 시 JPG로 변환해주세요.)'
    }
    if (file.size > 5 * 1024 * 1024) {
      return '파일 크기는 5MB 이하여야 합니다.'
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
      let width = 0
      let height = 0
      try {
        const dimensions = await getImageDimensions(file)
        width = dimensions.width
        height = dimensions.height
      } catch {
        // 이미지 크기 추출 실패해도 업로드는 진행
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('space', selectedSpace)
      formData.append('width', width.toString())
      formData.append('height', height.toString())

      const result = await uploadSpacePhoto(formData)

      if (result.success) {
        setSuccess('사진이 업로드되었습니다.')
        loadPhotos()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError('업로드 중 오류가 발생했습니다.')
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
      let width = 0
      let height = 0
      try {
        const dimensions = await getImageDimensions(file)
        width = dimensions.width
        height = dimensions.height
      } catch {
        // 이미지 크기 추출 실패해도 교체는 진행
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('width', width.toString())
      formData.append('height', height.toString())

      const result = await replaceSpacePhoto(photoId, formData)

      if (result.success) {
        setSuccess('사진이 교체되었습니다.')
        loadPhotos()
      } else {
        setError(result.error)
      }
    } catch (err) {
      setError('교체 중 오류가 발생했습니다.')
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
