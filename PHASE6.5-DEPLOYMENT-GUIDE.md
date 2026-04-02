# Phase 6.5 배포 가이드

**날짜**: 2026-04-03  
**작성자**: 버즈 (Subagent)  
**버전**: 1.0

---

## ✅ 완료된 작업

### 1. 코드 구현 완료

- ✅ DB 마이그레이션 파일 생성
  - `supabase/migrations/015_booking_prepaid_integration.sql` (컬럼 추가)
  - `supabase/migrations/016_booking_prepaid_rpc.sql` (RPC 함수)
- ✅ 유틸 함수 구현
  - `lib/prepaid/booking-utils.ts`
- ✅ Server Action 수정
  - `app/actions/bookings.ts` (createBooking, cancelBooking)
- ✅ API 엔드포인트 추가
  - `app/api/bookings/preview/route.ts` (비용 미리보기)
- ✅ 빌드 성공 확인
  - `npm run build` ✓ Compiled successfully
- ✅ Git commit + push 완료
  - Commit: `acb7f16`
  - Branch: `main`

---

## 📋 배포 절차

### Step 1: 마이그레이션 실행 (필수!)

**⚠️ 중요**: 코드가 배포되기 전에 반드시 마이그레이션을 먼저 실행해야 합니다.

1. **Supabase Dashboard 접속**
   ```
   https://supabase.com/dashboard/project/yopcycwuadnwrrkfldui/sql/new
   ```

2. **SQL Editor에서 마이그레이션 실행**
   
   아래 파일의 전체 내용을 복사하여 SQL Editor에 붙여넣고 실행:
   ```
   phase65-migration-combined.sql
   ```

3. **실행 확인**
   - "Run" 버튼 클릭
   - 성공 메시지 확인

4. **검증**
   - Table Editor → `bookings` 테이블 → 컬럼 확인:
     - `payment_method` (VARCHAR)
     - `user_id` (UUID)
     - `payment_status` (VARCHAR)
     - `cancelled_at` (TIMESTAMP)
   
   - Database → Functions → 함수 확인:
     - `create_booking_with_prepaid`
     - `cancel_booking_restore_prepaid`

### Step 2: Vercel 배포 확인

Git push가 완료되면 Vercel이 자동으로 배포를 시작합니다.

1. **Vercel Dashboard 확인**
   ```
   https://vercel.com/heesun-woodi/oneum-booking
   ```

2. **배포 상태 확인**
   - 최신 커밋 `acb7f16` 배포 확인
   - Build 성공 확인
   - Production URL 확인

3. **배포 URL**
   - Production: https://oneum-booking.vercel.app
   - Preview: (PR 배포 시)

---

## 🧪 테스트 시나리오

마이그레이션 + 배포 완료 후 다음 테스트 실행:

### 필수 테스트

1. **선불권 충분 (T1)**
   - 조건: 선불권 7시간 보유
   - 예약: 2시간
   - 기대: 선불권 5시간 남음, 즉시 확정 (payment_method='prepaid')

2. **선불권 부족 (T3)**
   - 조건: 선불권 2시간 보유
   - 예약: 3시간
   - 기대: 혼합 예약 (선불권 2h + 일반 1h, 14,000원 입금 대기)

3. **선불권 없음 (T4)**
   - 조건: 선불권 0시간
   - 예약: 2시간
   - 기대: 일반 예약 (28,000원 입금 대기)

4. **예약 취소 → 선불권 복구 (E3)**
   - 선불권으로 예약 생성 → 취소
   - 기대: 선불권 시간 복구됨

### 검증 방법

1. **DB 직접 확인**
   ```sql
   -- 예약 확인
   SELECT id, payment_method, prepaid_hours_used, regular_hours, amount, status, payment_status
   FROM bookings
   ORDER BY created_at DESC
   LIMIT 5;
   
   -- 선불권 잔액 확인
   SELECT id, total_hours, remaining_hours, expires_at, status
   FROM prepaid_purchases
   WHERE user_id = 'USER_UUID'
   ORDER BY expires_at ASC;
   
   -- 사용 내역 확인
   SELECT * FROM prepaid_usages
   ORDER BY used_at DESC
   LIMIT 10;
   ```

2. **애플리케이션 UI 확인**
   - 예약 모달에 선불권 정보 표시 확인
   - 예약 완료 후 메시지 확인
   - 마이페이지에서 예약 내역 확인

---

## 🐛 트러블슈팅

### 마이그레이션 실패 시

**증상**: SQL 실행 시 에러 발생

**해결**:
1. 개별 마이그레이션 파일 실행 시도:
   - 먼저 `015_booking_prepaid_integration.sql` 실행
   - 성공 후 `016_booking_prepaid_rpc.sql` 실행

2. 에러 메시지 확인:
   - "column already exists" → 이미 실행됨, 무시 가능
   - "function already exists" → 이미 실행됨, 무시 가능
   - 기타 에러 → 로그 캡처 후 검토

### 빌드 실패 시

**증상**: Vercel 배포 시 빌드 에러

**확인사항**:
1. 로컬 빌드 재실행:
   ```bash
   cd ~/Documents/buzz-workspace/projects/oneum
   npm run build
   ```

2. 타입 에러 확인:
   ```bash
   npm run lint
   ```

3. 에러 수정 후 재배포:
   ```bash
   git add .
   git commit -m "fix: 타입 에러 수정"
   git push origin main
   ```

### 선불권 차감 안 될 때

**증상**: 예약 생성은 되지만 선불권 차감 안됨

**확인사항**:
1. RPC 함수 존재 확인:
   ```sql
   SELECT routine_name 
   FROM information_schema.routines
   WHERE routine_name IN ('create_booking_with_prepaid', 'cancel_booking_restore_prepaid');
   ```

2. 함수 실행 로그 확인:
   ```sql
   SELECT * FROM prepaid_usages 
   ORDER BY used_at DESC LIMIT 10;
   ```

3. 애플리케이션 로그 확인:
   - Vercel → Deployments → Logs
   - 콘솔 에러 메시지 확인

---

## 📊 배포 상태 요약

| 항목 | 상태 | 비고 |
|------|------|------|
| 코드 구현 | ✅ 완료 | 8 files changed, 2677 insertions |
| 빌드 테스트 | ✅ 성공 | npm run build |
| Git Commit | ✅ 완료 | acb7f16 |
| Git Push | ✅ 완료 | origin/main |
| DB 마이그레이션 | ⏸️ 대기 | 수동 실행 필요 |
| Vercel 배포 | 🔄 자동 진행 | Git push 후 자동 트리거 |

---

## 📎 참고 문서

- **설계서**: `docs/PHASE_6.5_DESIGN.md`
- **구현 가이드**: `docs/PHASE_6.5_IMPLEMENTATION.md`
- **마이그레이션 SQL**: `phase65-migration-combined.sql`
- **유틸 함수**: `lib/prepaid/booking-utils.ts`
- **Server Action**: `app/actions/bookings.ts`

---

## ✅ 다음 단계 체크리스트

- [ ] Supabase Dashboard에서 마이그레이션 실행
- [ ] 실행 결과 확인 (테이블 컬럼, RPC 함수)
- [ ] Vercel 배포 완료 확인
- [ ] 테스트 시나리오 T1, T3, T4 실행
- [ ] 선불권 차감/복구 동작 확인
- [ ] UI에서 선불권 정보 표시 확인

---

**배포 완료 후 이 문서 하단에 실제 결과를 기록해주세요.**

```
실행 일시:
마이그레이션 결과:
배포 URL:
테스트 결과:
```
