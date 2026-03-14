# Phase 4 배포 체크리스트

## ✅ 완료된 작업

### 1. 코드 개발
- [x] Aligo API 클라이언트 (lib/aligo.ts)
- [x] 15개 메시지 템플릿 (lib/notifications/templates.ts)
- [x] 알림 발송 시스템 (lib/notifications/sender.ts)
- [x] 크론 작업 7개 (lib/cron/jobs.ts, app/api/cron/[job]/route.ts)
- [x] 입금 관리 페이지 (app/admin/payments/page.tsx)
- [x] 입금 관리 API (app/actions/payments.ts)
- [x] 이용 횟수 추적 API (app/actions/usage.ts)
- [x] 즉시 발송 통합 (bookings.ts, auth.ts, admin-users.ts)

### 2. DB 스키마
- [x] 마이그레이션 파일 생성 (supabase/migrations/002_phase4_alimtalk.sql)

### 3. Git & 배포
- [x] Git commit 완료
- [x] Git push 완료
- [x] Vercel 자동 배포 진행 중

---

## 🚨 필수 작업 (배포 전)

### 1. Supabase 마이그레이션 실행
**위치**: Supabase Dashboard → SQL Editor

**파일**: `supabase/migrations/002_phase4_alimtalk.sql`

**실행 방법**:
1. Supabase Dashboard 로그인
2. SQL Editor 열기
3. 마이그레이션 파일 내용 복사 & 실행
4. 성공 메시지 확인

**추가할 테이블/뷰**:
- notification_logs
- cron_job_logs
- monthly_usage (뷰)
- cancelled_same_day (뷰)

**수정할 테이블**:
- bookings (payment_status, payment_confirmed_at, cancelled_at 컬럼 추가)

---

### 2. Vercel 환경 변수 설정
**위치**: Vercel Dashboard → Settings → Environment Variables

**필수 환경 변수**:
```bash
# Aligo SMS API
ALIGO_API_KEY=your_api_key_here
ALIGO_USER_ID=your_user_id_here
ALIGO_SENDER=01012345678
ALIGO_TESTMODE=Y  # 테스트 시 Y, 실제 발송 시 N

# Cron Security
CRON_SECRET=c737811d32e86248dfa5db612a5688c10011e9851dad4bf8188129f6dfddce13

# Admin & Finance
ADMIN_PHONE=01041621557
FINANCE_PHONE=01082289532
BANK_ACCOUNT=카카오뱅크 7979-72-56275 (정상은)

# App URL (선택)
NEXT_PUBLIC_APP_URL=https://oneum.vercel.app
```

**설정 방법**:
1. Vercel Dashboard → 프로젝트 선택
2. Settings → Environment Variables
3. 각 변수 추가
4. Production / Preview / Development 환경 선택
5. Save

---

### 3. Vercel Cron 활성화 확인
**위치**: Vercel Dashboard → Crons

**설정된 크론 작업** (vercel.json):
- 00:00 - auto-cancel (미입금 자동 취소)
- 09:00 - day-before-reminder (전날 리마인더)
- 13:00 - payment-reminder (입금 리마인더 D-7/5/2)
- 16:00 - finance-alert-follow (재무 2차 알림)
- 21:00 - finance-alert-first (재무 1차 알림)
- 23:30 - finance-alert-final (재무 최종 알림)
- 매시간 - hourly-reminder (1시간 전 리마인더)

**확인 방법**:
1. Vercel Dashboard → Crons 탭
2. 9개 크론 작업이 모두 활성화되어 있는지 확인

---

### 4. Aligo API 키 발급
**위치**: https://smartsms.aligo.in

**발급 방법**:
1. Aligo 계정 생성/로그인
2. API 키 발급
3. 발신번호 등록 (01041621557 등)
4. Vercel 환경 변수에 설정

---

## ✅ 테스트 체크리스트

### 1. Aligo 테스트 발송
```bash
# 테스트 모드에서 발송 테스트
# ALIGO_TESTMODE=Y 설정 후 회원가입/예약 생성 테스트
```

### 2. 회원가입 플로우
- [ ] 회원가입 신청 → 6-1 (관리자 알림) 발송
- [ ] 관리자 승인 → 1-2 (승인 알림) 발송
- [ ] 관리자 거부 → 1-3 (거부 알림) 발송

### 3. 예약 플로우
- [ ] 회원 예약 생성 → 2-1 (예약 완료) 발송
- [ ] 비회원 예약 생성 → 2-2 (입금 안내) 발송
- [ ] 예약 취소 → 2-3 (취소 알림) 발송

### 4. 입금 관리
- [ ] /admin/payments 페이지 접근
- [ ] 미입금 예약 목록 조회
- [ ] 입금 확인 체크박스 클릭 → 3-1 (입금 확인) 발송

### 5. 크론 작업
- [ ] 수동 크론 호출 테스트 (cURL)
```bash
curl -X GET https://oneum.vercel.app/api/cron/day-before-reminder \
  -H "Authorization: Bearer c737811d32e86248dfa5db612a5688c10011e9851dad4bf8188129f6dfddce13"
```

---

## 🔧 문제 해결

### Aligo 발송 실패 시
1. API 키 확인 (Vercel 환경 변수)
2. 발신번호 등록 확인
3. 테스트 모드 확인 (ALIGO_TESTMODE=Y)
4. notification_logs 테이블에서 에러 확인

### 크론 작업 실행 안 될 시
1. CRON_SECRET 확인
2. Vercel Cron 활성화 확인
3. cron_job_logs 테이블에서 로그 확인

### DB 마이그레이션 실패 시
1. Supabase SQL Editor에서 에러 메시지 확인
2. 기존 컬럼/테이블 존재 여부 확인
3. IF NOT EXISTS 사용 확인

---

## 📊 배포 완료 확인

- [ ] Vercel 배포 성공
- [ ] Supabase 마이그레이션 실행 완료
- [ ] Vercel 환경 변수 설정 완료
- [ ] Aligo 테스트 발송 성공
- [ ] /admin/payments 페이지 접근 가능
- [ ] 크론 작업 수동 테스트 성공

---

## 🚀 다음 단계

1. **테스트 모드 해제**: ALIGO_TESTMODE=N 설정
2. **실제 발송 테스트**: 소수 사용자 대상 테스트
3. **모니터링**: notification_logs, cron_job_logs 확인
4. **사용자 피드백 수집**

---

**작성일**: 2026-03-15  
**작성자**: Buzz (코디)
