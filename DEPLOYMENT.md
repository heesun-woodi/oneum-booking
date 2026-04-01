# 🚀 온음 프로젝트 배포 가이드

## ✅ 완료된 작업 (2026-04-01)

### 회원 삭제 오류 수정 - Soft Delete 구현

**문제**: 
- 예약 기록이 있는 회원 삭제 시 "예약 정보 조회 중 오류가 발생했습니다." 오류 발생
- Foreign key constraint로 인해 DELETE 쿼리 실행 불가

**해결**:
1. ✅ Soft Delete 방식으로 변경 (deleted_at 컬럼 추가)
2. ✅ 코드 수정 완료 (app/actions/admin-users.ts)
3. ✅ Git commit + push 완료
4. ✅ Vercel 자동 배포 진행 중

---

## ⚠️ 수동 작업 필요: Supabase Migration 실행

**Vercel 배포는 자동으로 진행되지만, Supabase DB 스키마 변경은 수동으로 적용해야 합니다.**

### 1. Supabase 대시보드 접속

🔗 **Supabase 프로젝트**: https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui

### 2. SQL Editor에서 Migration 실행

**경로**: `SQL Editor` → 새 쿼리 생성

**실행할 SQL** (파일: `supabase/migrations/007_soft_delete_users.sql`):

```sql
-- 007_soft_delete_users.sql
-- 회원 삭제를 Soft Delete 방식으로 변경

-- users 테이블에 deleted_at 컬럼 추가
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

-- 삭제된 회원 필터링을 위한 인덱스
CREATE INDEX IF NOT EXISTS idx_users_deleted_at 
  ON users(deleted_at) 
  WHERE deleted_at IS NOT NULL;

-- 완료
SELECT '✅ Soft Delete 컬럼 추가 완료! deleted_at 필드로 회원 비활성화 가능' as message;
```

### 3. 실행 확인

SQL 실행 후 다음 메시지가 표시되면 성공:

```
✅ Soft Delete 컬럼 추가 완료! deleted_at 필드로 회원 비활성화 가능
```

---

## 🧪 테스트

Migration 적용 후 관리자 페이지에서 테스트:

1. **관리자 로그인**: https://oneum.vercel.app/admin/login
2. **회원 관리**: https://oneum.vercel.app/admin/users → "승인됨" 탭
3. **삭제 테스트**: 
   - 예약 기록이 있는 회원 선택
   - "삭제" 버튼 클릭
   - ✅ 성공 메시지: "XXX님이 비활성화되었습니다. (N건의 예약 기록 보존됨)"
   - ✅ 회원 목록에서 사라짐 (deleted_at이 설정됨)

---

## 📊 변경 내용 요약

### 코드 변경
- `app/actions/admin-users.ts`:
  - `getSignupRequests()`: deleted_at IS NULL 필터 추가
  - `deleteUser()`: DELETE → UPDATE deleted_at으로 변경
  
### DB 스키마 변경
- `users` 테이블:
  - `deleted_at TIMESTAMP WITH TIME ZONE` 컬럼 추가
  - `idx_users_deleted_at` 인덱스 추가

### 장점
- ✅ 예약 기록이 있어도 회원 비활성화 가능
- ✅ 데이터 보존으로 추적성 확보 (Audit Trail)
- ✅ 실수로 삭제해도 복구 가능 (deleted_at을 NULL로 변경)
- ✅ Foreign key constraint 문제 완전 해결

---

## 🔄 Rollback (필요 시)

만약 문제가 발생하면:

```sql
-- 삭제된 회원 복구
UPDATE users 
SET deleted_at = NULL 
WHERE id = 'USER_ID';

-- 컬럼 제거 (필요 시)
ALTER TABLE users DROP COLUMN deleted_at;
DROP INDEX idx_users_deleted_at;
```

---

## ✅ 완료 체크리스트

- [x] 코드 수정 완료
- [x] Git commit + push
- [x] Vercel 배포 대기 중
- [ ] **Supabase Migration 실행** ← 👈 이것만 남았습니다!
- [ ] 관리자 페이지에서 삭제 기능 테스트
- [ ] 예약 기록 있는 회원 삭제 테스트

---

**문의**: 궁금한 점이 있으면 버즈에게 물어보세요! 🚀
