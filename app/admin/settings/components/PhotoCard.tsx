'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { Trash2, RefreshCw, Image as ImageIcon } from 'lucide-react'
import type { SpacePhoto } from '@/app/actions/space-photos'

interface PhotoCardProps {
  photo: SpacePhoto
  onReplace: (file: File) => void
  onDelete: () => void
}

export function PhotoCard({ photo, onReplace, onDelete }: PhotoCardProps) {
  const [isDeleting, setIsDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleReplaceClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onReplace(file)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDeleteClick = () => {
    setIsDeleting(true)
    onDelete()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  return (
    <div className={`
      relative bg-white border border-gray-200 rounded-lg overflow-hidden
      transition-all hover:shadow-md
      ${isDeleting ? 'opacity-50 pointer-events-none' : ''}
    `}>
      {/* 이미지 프리뷰 */}
      <div className="relative aspect-square bg-gray-100">
        <Image
          src={photo.url || ''}
          alt={photo.alt_text || photo.file_name}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 50vw, 25vw"
        />
        
        {isDeleting && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="animate-spin rounded-full h-8 w-8 border-4 border-white border-t-transparent"></div>
          </div>
        )}
      </div>

      {/* 정보 & 액션 */}
      <div className="p-3 space-y-2">
        {/* 파일 정보 */}
        <div className="flex items-start gap-2">
          <ImageIcon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate" title={photo.file_name}>
              {photo.file_name}
            </p>
            <p className="text-xs text-gray-500">
              {formatFileSize(photo.file_size)}
              {photo.width && photo.height && (
                <> · {photo.width}×{photo.height}</>
              )}
            </p>
          </div>
        </div>

        {/* 액션 버튼 */}
        <div className="flex gap-2">
          <button
            onClick={handleReplaceClick}
            className="
              flex-1 flex items-center justify-center gap-1.5
              px-3 py-1.5 text-sm font-medium
              text-blue-700 bg-blue-50 hover:bg-blue-100
              rounded-md transition-colors
            "
          >
            <RefreshCw className="w-4 h-4" />
            교체
          </button>
          
          <button
            onClick={handleDeleteClick}
            className="
              flex-1 flex items-center justify-center gap-1.5
              px-3 py-1.5 text-sm font-medium
              text-red-700 bg-red-50 hover:bg-red-100
              rounded-md transition-colors
            "
          >
            <Trash2 className="w-4 h-4" />
            삭제
          </button>
        </div>
      </div>

      {/* 숨겨진 파일 입력 */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  )
}
