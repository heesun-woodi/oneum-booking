# Supabase Storage 설정 가이드

공간 사진 관리 기능을 사용하기 위해 Supabase Storage 버킷을 설정해야 합니다.

---

## 📋 설정 순서

### 1. Migration 실행

먼저 DB 테이블을 생성합니다:

```bash
cd ~/Documents/buzz-workspace/projects/oneum
```

Supabase Dashboard에서:
1. Project → SQL Editor 이동
2. `supabase/migrations/010_space_photos.sql` 파일 내용 복사
3. 새 쿼리 만들기 → 붙여넣기 → 실행 (Run)

또는 로컬 Supabase CLI 사용 시:

```bash
supabase db push
```

---

### 2. Storage 버킷 생성

#### 방법 A: Supabase Dashboard (권장)

1. **Supabase Dashboard** 접속
2. **Storage** 메뉴 클릭
3. **Create a new bucket** 클릭
4. 다음 설정 입력:
   - **Bucket name**: `space-photos`
   - **Public bucket**: ✅ 체크 (공개 접근 허용)
   - **File size limit**: `5242880` (5MB)
   - **Allowed MIME types**: `image/jpeg`, `image/png`, `image/webp` (콤마로 구분)

5. **Create bucket** 클릭

#### 방법 B: SQL 실행 (고급)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'space-photos',
  'space-photos',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
);
```

---

### 3. Storage RLS 정책 설정

Supabase Dashboard → Storage → Policies → `space-photos` 버킷 선택

#### 정책 1: 공개 읽기

```sql
CREATE POLICY "Public read access" ON storage.objects
  FOR SELECT USING (bucket_id = 'space-photos');
```

#### 정책 2: 관리자만 업로드

```sql
CREATE POLICY "Admin write access" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'space-photos' AND
    EXISTS (
      SELECT 1 FROM auth.sessions 
      WHERE user_id = auth.uid() 
      AND metadata->>'role' = 'admin'
    )
  );
```

#### 정책 3: 관리자만 삭제

```sql
CREATE POLICY "Admin delete access" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'space-photos' AND
    EXISTS (
      SELECT 1 FROM auth.sessions 
      WHERE user_id = auth.uid() 
      AND metadata->>'role' = 'admin'
    )
  );
```

---

### 4. 동작 확인

#### 관리자 페이지 접속

1. 브라우저에서 `https://yourdomain.com/admin/settings` 접속
2. 로그인 (관리자 계정)
3. **📷 공간 사진 관리** 섹션 확인
4. 테스트 사진 업로드 시도

#### 메인 페이지 확인

1. `https://yourdomain.com` 접속
2. 놀터/방음실 탭 전환
3. 갤러리가 표시되는지 확인

---

## 🔍 문제 해결

### 업로드 실패

**에러**: "파일 업로드 실패"

**원인**: Storage 버킷 미생성 또는 RLS 정책 누락

**해결**:
1. Supabase Dashboard → Storage → Buckets 확인
2. `space-photos` 버킷이 있는지 확인
3. Policies 탭에서 3개 정책 모두 생성되었는지 확인

### 사진이 보이지 않음

**에러**: 이미지 로딩 실패 (404)

**원인**: Public bucket 설정 안 됨

**해결**:
1. Storage → `space-photos` → Settings
2. "Public bucket" 옵션 ✅ 체크
3. 저장

### 관리자만 업로드 가능해야 하는데 누구나 업로드됨

**원인**: RLS 정책이 너무 관대함

**해결**:
1. Storage → `space-photos` → Policies
2. "Admin write access" 정책의 `WITH CHECK` 조건 확인
3. `auth.uid()`와 `role = 'admin'` 체크 로직 확인

---

## 📁 파일 경로 구조

Storage에 업로드된 파일은 다음 구조로 저장됩니다:

```
space-photos/
├── nolter/
│   ├── 1711958400000_main_entrance.jpg
│   ├── 1711958500000_play_area.jpg
│   └── 1711958600000_facilities.jpg
└── soundroom/
    ├── 1711958700000_room_view.jpg
    ├── 1711958800000_equipment.jpg
    └── 1711958900000_piano_corner.jpg
```

**경로 패턴**: `{space}/{timestamp}_{sanitized_filename}.{ext}`

---

## ✅ 완료 체크리스트

- [ ] Migration 010 실행 완료 (`space_photos` 테이블 생성)
- [ ] Storage 버킷 `space-photos` 생성
- [ ] Public bucket 설정 활성화
- [ ] RLS 정책 3개 생성 (read, write, delete)
- [ ] 관리자 페이지에서 테스트 업로드 성공
- [ ] 메인 페이지에서 갤러리 표시 확인
- [ ] 놀터/방음실 탭 전환 시 사진 변경 확인

---

설정 완료 후 문제가 있으면 버즈에게 물어보세요! 🚀
