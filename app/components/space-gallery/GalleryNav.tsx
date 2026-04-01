'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface GalleryNavProps {
  total: number
  current: number
  onPrev: () => void
  onNext: () => void
  onDotClick: (index: number) => void
}

export function GalleryNav({ total, current, onPrev, onNext, onDotClick }: GalleryNavProps) {
  return (
    <>
      {/* 좌/우 화살표 */}
      <button
        onClick={onPrev}
        className="
          absolute left-2 top-1/2 -translate-y-1/2 z-20
          bg-black/50 hover:bg-black/70 text-white
          rounded-full p-2 transition-all
          hover:scale-110
        "
        aria-label="이전 사진"
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button
        onClick={onNext}
        className="
          absolute right-2 top-1/2 -translate-y-1/2 z-20
          bg-black/50 hover:bg-black/70 text-white
          rounded-full p-2 transition-all
          hover:scale-110
        "
        aria-label="다음 사진"
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      {/* 하단 도트 인디케이터 */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex gap-2">
        {Array.from({ length: total }).map((_, index) => (
          <button
            key={index}
            onClick={() => onDotClick(index)}
            className={`
              w-2 h-2 rounded-full transition-all
              ${index === current 
                ? 'bg-white w-6' 
                : 'bg-white/50 hover:bg-white/80'
              }
            `}
            aria-label={`${index + 1}번째 사진으로 이동`}
          />
        ))}
      </div>
    </>
  )
}
