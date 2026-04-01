'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSpacePhotos, type SpacePhoto } from '@/app/actions/space-photos'
import { GallerySlide } from './GallerySlide'
import { GalleryNav } from './GalleryNav'
import { Lightbox } from './Lightbox'

interface SpaceGalleryProps {
  space: 'nolter' | 'soundroom'
}

export function SpaceGallery({ space }: SpaceGalleryProps) {
  const [photos, setPhotos] = useState<SpacePhoto[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isLightboxOpen, setIsLightboxOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 사진 로드
  const loadPhotos = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    
    const result = await getSpacePhotos(space)
    
    if (result.success) {
      setPhotos(result.photos)
      setCurrentIndex(0)  // 탭 전환 시 첫 사진으로 리셋
    } else {
      setError(result.error)
    }
    
    setIsLoading(false)
  }, [space])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  // 자동 슬라이드 (5초 간격)
  useEffect(() => {
    if (photos.length <= 1 || isLightboxOpen) return

    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % photos.length)
    }, 5000)

    return () => clearInterval(timer)
  }, [photos.length, isLightboxOpen])

  // 네비게이션 핸들러
  const handlePrev = () => {
    setCurrentIndex(prev => prev === 0 ? photos.length - 1 : prev - 1)
  }

  const handleNext = () => {
    setCurrentIndex(prev => (prev + 1) % photos.length)
  }

  const handleDotClick = (index: number) => {
    setCurrentIndex(index)
  }

  const handlePhotoClick = () => {
    setIsLightboxOpen(true)
  }

  // 터치 스와이프 지원
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  const minSwipeDistance = 50

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      handleNext()
    } else if (isRightSwipe) {
      handlePrev()
    }
  }

  // 로딩 상태
  if (isLoading) {
    return (
      <div className="relative bg-gray-100 rounded-lg overflow-hidden h-48 sm:h-64 md:h-80 animate-pulse">
        <div className="absolute inset-0 bg-gray-200"></div>
      </div>
    )
  }

  // 에러 상태 (개발 모드에서만 표시)
  if (error && process.env.NODE_ENV === 'development') {
    return (
      <div className="relative bg-red-50 rounded-lg p-4 text-red-700 text-sm">
        ⚠️ 사진 로드 실패: {error}
      </div>
    )
  }

  // 사진 없음 - 갤러리 숨김
  if (photos.length === 0) {
    return null
  }

  return (
    <div className="relative bg-gray-100 rounded-lg overflow-hidden shadow-sm">
      {/* 슬라이드 영역 */}
      <div
        className="relative h-48 sm:h-64 md:h-80"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {photos.map((photo, index) => (
          <GallerySlide
            key={photo.id}
            photo={photo}
            isActive={index === currentIndex}
            onClick={handlePhotoClick}
          />
        ))}
      </div>

      {/* 네비게이션 (2장 이상일 때만 표시) */}
      {photos.length > 1 && (
        <GalleryNav
          total={photos.length}
          current={currentIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          onDotClick={handleDotClick}
        />
      )}

      {/* 라이트박스 */}
      {isLightboxOpen && (
        <Lightbox
          photos={photos}
          initialIndex={currentIndex}
          onClose={() => setIsLightboxOpen(false)}
        />
      )}
    </div>
  )
}
