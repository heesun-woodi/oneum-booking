'use client'

import Image from 'next/image'
import type { SpacePhoto } from '@/app/actions/space-photos'

interface GallerySlideProps {
  photo: SpacePhoto
  isActive: boolean
  onClick: () => void
}

export function GallerySlide({ photo, isActive, onClick }: GallerySlideProps) {
  return (
    <div
      className={`
        absolute inset-0 transition-opacity duration-500 cursor-pointer
        ${isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'}
      `}
      onClick={onClick}
    >
      <Image
        src={photo.url || ''}
        alt={photo.alt_text || `${photo.space} 사진`}
        fill
        className="object-cover"
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
        priority={isActive}
      />
    </div>
  )
}
