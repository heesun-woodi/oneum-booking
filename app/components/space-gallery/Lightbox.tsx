'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import type { SpacePhoto } from '@/app/actions/space-photos'

interface LightboxProps {
  photos: SpacePhoto[]
  initialIndex: number
  onClose: () => void
}

export function Lightbox({ photos, initialIndex, onClose }: LightboxProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex)

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowLeft') {
        handlePrev()
      } else if (e.key === 'ArrowRight') {
        handleNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, photos.length])

  // body 스크롤 방지
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = 'unset'
    }
  }, [])

  const handlePrev = () => {
    setCurrentIndex(prev => prev === 0 ? photos.length - 1 : prev - 1)
  }

  const handleNext = () => {
    setCurrentIndex(prev => (prev + 1) % photos.length)
  }

  const currentPhoto = photos[currentIndex]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* 닫기 버튼 */}
      <button
        onClick={onClose}
        className="
          absolute top-4 right-4 z-50
          bg-white/10 hover:bg-white/20
          text-white rounded-full p-2
          transition-all
        "
        aria-label="닫기"
      >
        <X className="w-6 h-6" />
      </button>

      {/* 이미지 영역 */}
      <div
        className="relative w-full h-full max-w-6xl max-h-[90vh] mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={currentPhoto.url || ''}
          alt={currentPhoto.alt_text || '공간 사진'}
          fill
          className="object-contain"
          sizes="100vw"
          priority
        />
      </div>

      {/* 네비게이션 (2장 이상일 때) */}
      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation()
              handlePrev()
            }}
            className="
              absolute left-4 top-1/2 -translate-y-1/2 z-50
              bg-white/10 hover:bg-white/20
              text-white rounded-full p-3
              transition-all
            "
            aria-label="이전 사진"
          >
            <ChevronLeft className="w-8 h-8" />
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation()
              handleNext()
            }}
            className="
              absolute right-4 top-1/2 -translate-y-1/2 z-50
              bg-white/10 hover:bg-white/20
              text-white rounded-full p-3
              transition-all
            "
            aria-label="다음 사진"
          >
            <ChevronRight className="w-8 h-8" />
          </button>

          {/* 카운터 */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 text-white text-sm">
            {currentIndex + 1} / {photos.length}
          </div>
        </>
      )}
    </div>
  )
}
