-- ===== 공간 사진 관리 기능 =====
-- Migration: 010_space_photos
-- Description: 공간별(놀터/방음실) 사진 갤러리 기능
-- Created: 2026-04-01

-- ===== 1. 공간 사진 테이블 =====
CREATE TABLE space_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 공간 정보
  space VARCHAR(20) NOT NULL CHECK (space IN ('nolter', 'soundroom')),
  
  -- 파일 정보
  file_name VARCHAR(255) NOT NULL,           -- 원본 파일명
  storage_path VARCHAR(500) NOT NULL,        -- Supabase Storage 경로
  file_size INTEGER NOT NULL,                -- 바이트 단위
  mime_type VARCHAR(50) NOT NULL,            -- image/jpeg, image/png 등
  width INTEGER,                             -- 이미지 너비 (px)
  height INTEGER,                            -- 이미지 높이 (px)
  
  -- 정렬 & 메타
  display_order INTEGER DEFAULT 0,           -- 표시 순서 (낮을수록 먼저)
  alt_text VARCHAR(255),                     -- 접근성용 대체 텍스트
  is_active BOOLEAN DEFAULT true,            -- 활성화 여부
  
  -- 타임스탬프
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- 제약조건
  UNIQUE(storage_path)
);

-- ===== 2. 인덱스 =====
CREATE INDEX idx_space_photos_space ON space_photos(space);
CREATE INDEX idx_space_photos_active_order ON space_photos(space, is_active, display_order);

-- ===== 3. RLS 정책 =====
ALTER TABLE space_photos ENABLE ROW LEVEL SECURITY;

-- 모든 사용자 조회 가능 (공개 갤러리)
CREATE POLICY "Anyone can view active photos" ON space_photos
  FOR SELECT USING (is_active = true);

-- 관리자만 CUD 가능 (관리자 세션 체크)
CREATE POLICY "Admin can manage photos" ON space_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM auth.sessions 
      WHERE user_id = auth.uid() 
      AND metadata->>'role' = 'admin'
    )
  );

-- ===== 4. Storage 버킷 설정 =====
-- 참고: 아래 SQL은 Supabase Dashboard에서 수동 실행 필요
-- 또는 Storage API를 통해 프로그래밍 방식으로 생성

/*
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'space-photos',
  'space-photos',
  true,  -- 공개 접근 (이미지 URL로 직접 접근 가능)
  5242880,  -- 5MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
*/

-- ===== 5. Storage RLS 정책 =====
-- 참고: Storage 버킷 생성 후 아래 정책 적용

/*
-- 읽기: 모든 사용자
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'space-photos');

-- 쓰기: 관리자만
CREATE POLICY "Admin write access" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'space-photos' AND
    EXISTS (
      SELECT 1 FROM auth.sessions 
      WHERE user_id = auth.uid() 
      AND metadata->>'role' = 'admin'
    )
  );

-- 삭제: 관리자만
CREATE POLICY "Admin delete access" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'space-photos' AND
    EXISTS (
      SELECT 1 FROM auth.sessions 
      WHERE user_id = auth.uid() 
      AND metadata->>'role' = 'admin'
    )
  );
*/

-- ===== 6. 함수: updated_at 자동 업데이트 =====
CREATE OR REPLACE FUNCTION update_space_photos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER space_photos_updated_at
  BEFORE UPDATE ON space_photos
  FOR EACH ROW
  EXECUTE FUNCTION update_space_photos_updated_at();

-- ===== 완료 =====
-- Migration 010 완료
-- 다음 단계: Supabase Dashboard에서 Storage 버킷 수동 생성
