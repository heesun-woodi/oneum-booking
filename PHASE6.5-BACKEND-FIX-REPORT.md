# Phase 6.5 백엔드 선불권 연동 수정 완료 리포트

**날짜**: 2026-04-03  
**담당**: 버즈 (Subagent)  
**작업 시간**: 약 1시간

---

## 🎯 문제 정의

### 증상
- **UI**: 선불권 표시 정상 ✓
- **DB**: 선불권 차감 **미반영** ✗

### DB 증거
```sql
-- bookings 테이블
prepaid_hours_used: 0
payment_status: completed
user_id: NULL  ⬅️ 핵심 문제!

-- prepaid_purchases 테이블
remaining_hours: 변동 없음 (7시간 그대로)

-- prepaid_usages 테이블
0건 (비어있음) ⬅️ RPC 함수 미호출 증거
```

---

## 🔍 원인 분석

### 1단계: RPC 함수 확인
- **결과**: ✅ RPC 함수 정상 배포됨
- `create_booking_with_prepaid` ✓
- `cancel_booking_restore_prepaid` ✓

### 2단계: 백엔드 코드 확인
- **app/actions/bookings.ts**: ✅ 정상
- **lib/prepaid/booking-utils.ts**: ✅ 정상
- `executeBookingWithPrepaid()` 호출 코드 존재

### 3단계: 프론트엔드 코드 확인 ⬅️ **문제 발견!**

**app/page.tsx (line 505-513)**:
```typescript
const bookingInput: CreateBookingInput = {
  bookingDate,
  times: selectedTimes,
  space: selectedSpace,
  memberType: userSession.isLoggedIn ? 'member' : 'non-member',
  household: userSession.isLoggedIn ? userSession.household : undefined,
  name,     // ❌ 로그인 시 빈 문자열!
  phone,    // ❌ 로그인 시 빈 문자열!
  // ❌ userId가 전혀 전달되지 않음!
}
```

**백엔드 로직 (app/actions/bookings.ts)**:
```typescript
} else if (input.userId) {
  // 로그인 사용자: 선불권 확인
  console.log('🎫 Checking prepaid for user:', input.userId)
  ...
} else {
  // 비로그인: 일반 결제
  amount = hours * 14000
}
```

**결론**:
- `userId`가 전달되지 않아 **선불권 로직 자체가 실행되지 않음**
- DB에서 모든 예약의 `user_id: NULL` 확인
- `prepaid_usages` 테이블 비어있음 = RPC 미호출

---

## 🛠️ 수정 내용

### app/page.tsx

**Before**:
```typescript
const bookingInput: CreateBookingInput = {
  bookingDate,
  times: selectedTimes,
  space: selectedSpace,
  memberType: userSession.isLoggedIn ? 'member' : 'non-member',
  household: userSession.isLoggedIn ? userSession.household : undefined,
  name,
  phone
}
```

**After**:
```typescript
const bookingInput: CreateBookingInput = {
  bookingDate,
  times: selectedTimes,
  space: selectedSpace,
  memberType: userSession.isLoggedIn ? 'member' : 'non-member',
  household: userSession.isLoggedIn ? userSession.household : undefined,
  name: userSession.isLoggedIn ? userSession.name : name,  // ⭐ 세션 정보 사용
  phone: userSession.isLoggedIn ? userSession.phone : phone, // ⭐ 세션 정보 사용
  userId: userSession.userId // ⭐ 선불권 사용을 위한 userId 전달
}

console.log('🚀 예약 시작:', bookingInput)
console.log('🎫 userId:', userSession.userId || '(없음 - 선불권 미사용)')
```

### 변경 사항 요약
1. **userId 전달 추가** - `userSession.userId`
2. **name 수정** - 로그인 시 `userSession.name` 사용
3. **phone 수정** - 로그인 시 `userSession.phone` 사용
4. **디버깅 로그 추가** - userId 확인용

---

## ✅ 검증

### 1. 빌드 테스트
```bash
$ npm run build
✓ Compiled successfully
```

### 2. RPC 함수 확인
```bash
$ node check-rpc-functions.mjs
✅ create_booking_with_prepaid 함수 존재 및 실행 가능
✅ cancel_booking_restore_prepaid 함수 존재 및 실행 가능
```

### 3. DB 상태 확인
```bash
$ node debug-prepaid-issue.mjs

1️⃣ 최근 예약: user_id 모두 NULL (수정 전)
2️⃣ 선불권: 7시간, 2시간 잔여 (정상)
3️⃣ 사용 내역: 0건 (수정 전)
```

### 4. Git 배포
```bash
$ git add -A
$ git commit -m "fix(phase6.5): 예약 시 userId 전달하여 선불권 차감 활성화"
$ git pull --rebase origin main
$ git push origin main
✓ Push 성공

Commit: 84ea943
```

---

## 🧪 테스트 시나리오 (배포 후)

### 필수 테스트

**T1: 선불권 충분 (2시간 예약, 7시간 보유)**
- [ ] 로그인 (userId 있는 사용자)
- [ ] 예약 생성 (2시간)
- [ ] DB 확인:
  - [ ] `bookings.user_id`: UUID 존재 ✓
  - [ ] `bookings.prepaid_hours_used`: 2 ✓
  - [ ] `bookings.payment_method`: 'prepaid' ✓
  - [ ] `prepaid_purchases.remaining_hours`: 5 (7-2) ✓
  - [ ] `prepaid_usages`: 1건 추가 ✓

**T2: 선불권 부족 (3시간 예약, 2시간 보유)**
- [ ] 예약 생성 (3시간)
- [ ] DB 확인:
  - [ ] `bookings.prepaid_hours_used`: 2 ✓
  - [ ] `bookings.regular_hours`: 1 ✓
  - [ ] `bookings.payment_method`: 'mixed' ✓
  - [ ] `bookings.amount`: 14000 (1시간 * 14000) ✓

**T3: 선불권 없음 (일반 결제)**
- [ ] 로그인 (선불권 없는 사용자)
- [ ] 예약 생성 (2시간)
- [ ] DB 확인:
  - [ ] `bookings.prepaid_hours_used`: 0 ✓
  - [ ] `bookings.regular_hours`: 2 ✓
  - [ ] `bookings.payment_method`: 'regular' ✓
  - [ ] `bookings.amount`: 28000 ✓

**T4: 예약 취소 → 선불권 복구**
- [ ] 선불권 예약 생성 (2시간)
- [ ] 예약 취소
- [ ] DB 확인:
  - [ ] `bookings.status`: 'cancelled' ✓
  - [ ] `prepaid_purchases.remaining_hours`: 복구됨 (+2) ✓
  - [ ] `prepaid_usages`: 삭제됨 ✓

---

## 📊 DB 쿼리 (검증용)

```sql
-- 최근 예약 확인 (userId 있는지)
SELECT id, booking_date, user_id, prepaid_hours_used, regular_hours, payment_method, amount
FROM bookings
ORDER BY created_at DESC
LIMIT 5;

-- 선불권 잔액 확인
SELECT id, user_id, total_hours, remaining_hours, expires_at, status
FROM prepaid_purchases
WHERE status = 'paid'
ORDER BY expires_at ASC;

-- 선불권 사용 내역 확인
SELECT pu.*, pp.remaining_hours, b.booking_date
FROM prepaid_usages pu
JOIN prepaid_purchases pp ON pu.purchase_id = pp.id
JOIN bookings b ON pu.booking_id = b.id
ORDER BY pu.used_at DESC
LIMIT 10;
```

---

## 🚀 배포 상태

| 항목 | 상태 | 비고 |
|------|------|------|
| 문제 분석 | ✅ 완료 | userId 미전달 |
| 코드 수정 | ✅ 완료 | app/page.tsx |
| 빌드 테스트 | ✅ 성공 | npm run build |
| Git Commit | ✅ 완료 | 84ea943 |
| Git Push | ✅ 완료 | origin/main |
| Vercel 배포 | 🔄 자동 진행 | Git push 후 트리거 |
| 실제 테스트 | ⏸️ 대기 | 배포 완료 후 |

---

## 🎓 교훈

### 1. 디버깅 프로세스
1. ✅ RPC 함수 존재 여부 확인 (백엔드)
2. ✅ 백엔드 코드 로직 확인
3. ✅ **프론트엔드 데이터 전달 확인** ⬅️ **핵심!**
4. ✅ DB 실제 데이터 확인

### 2. 선불권 로직 실행 조건
```typescript
if (input.userId) {
  // ⭐ userId가 있어야 선불권 로직 실행!
  const prepaidPurchases = await getAvailablePrepaidPurchases(...)
  ...
}
```

### 3. 로그인 사용자 정보 활용
- `userSession.userId` - 선불권 조회용
- `userSession.name` - 예약자 이름
- `userSession.phone` - 예약자 연락처

---

## 📎 참고 파일

- **수정 파일**: `app/page.tsx`
- **백엔드**: `app/actions/bookings.ts`, `lib/prepaid/booking-utils.ts`
- **디버깅 스크립트**:
  - `check-rpc-functions.mjs` - RPC 함수 존재 확인
  - `debug-prepaid-issue.mjs` - DB 상태 디버깅
- **마이그레이션**: `phase65-migration-combined.sql`

---

## ✅ 다음 단계 (우디 확인 필요)

1. [ ] Vercel 배포 완료 확인
2. [ ] 로그인 후 선불권 예약 테스트
3. [ ] DB에서 userId, prepaid_hours_used 확인
4. [ ] prepaid_usages 테이블에 사용 내역 확인
5. [ ] 선불권 차감 확인 (remaining_hours)
6. [ ] 예약 취소 시 선불권 복구 확인

---

**완료 일시**: 2026-04-03  
**커밋**: 84ea943  
**배포**: Vercel 자동 배포 진행 중
