'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'

interface PhotoUploaderProps {
  onUpload: (file: File) => void
  isUploading: boolean
}

export function PhotoUploader({ onUpload, isUploading }: PhotoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      onUpload(file)
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      onUpload(file)
    }
  }

  return (
    <div
      onClick={isUploading ? undefined : handleClick}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`
        relative aspect-square
        border-2 border-dashed rounded-lg
        flex flex-col items-center justify-center
        transition-all
        ${isUploading
          ? 'bg-gray-50 border-gray-300 cursor-wait'
          : isDragging
          ? 'bg-blue-50 border-blue-400 cursor-pointer'
          : 'bg-gray-50 border-gray-300 hover:bg-gray-100 hover:border-gray-400 cursor-pointer'
        }
      `}
    >
      {isUploading ? (
        <>
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
          <p className="mt-3 text-sm text-gray-600">업로드 중...</p>
        </>
      ) : (
        <>
          <Upload className={`w-10 h-10 ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
          <p className="mt-3 text-sm font-medium text-gray-700">
            사진 추가
          </p>
          <p className="mt-1 text-xs text-gray-500 text-center px-4">
            클릭 또는 드래그하여<br />
            이미지 업로드
          </p>
          <p className="mt-2 text-xs text-gray-400">
            JPG, PNG, WebP
          </p>
        </>
      )}

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
