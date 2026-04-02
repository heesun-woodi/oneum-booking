# 온음 공간 예약 시스템 - 10회 선불권 PRD

**문서 버전**: 1.0  
**작성일**: 2026-04-02  
**작성자**: 버즈 (AI Assistant)  
**상태**: Draft

---

## 📋 목차

1. [개요](#1-개요)
2. [회원 정책 변경](#2-회원-정책-변경)
3. [선불권 상품 명세](#3-선불권-상품-명세)
4. [DB 스키마 설계](#4-db-스키마-설계)
5. [UI/UX 변경사항](#5-uiux-변경사항)
6. [예약 플로우 변경](#6-예약-플로우-변경)
7. [SMS 메시지 설계](#7-sms-메시지-설계)
8. [개발 단계](#8-개발-단계)
9. [테스트 시나리오](#9-테스트-시나리오)

---

## 1. 개요

### 1.1 배경

온음 공간(놀터, 방음실)은 현재 세대 회원과 비회원을 대상으로 예약 서비스를 제공하고 있습니다. 그러나 다음과 같은 니즈가 있습니다:

- **비세대 회원의 정기 이용 수요**: 외부인도 자주 이용하고 싶어함
- **할인 상품 제공**: 정기 이용자에게 혜택 제공으로 충성도 확보
- **선결제 수익 확보**: 미리 결제받아 안정적 수익 창출

### 1.2 목표

1. **10회 선불권** 상품 도입으로 정기 이용 고객 확보
2. **회원 정책 개편**: 누구나 회원가입 가능하도록 변경
3. **할인 혜택 제공**: 10회권 구매 시 약 29% 할인 (140,000원 → 100,000원)

### 1.3 범위

| 포함 | 제외 |
|------|------|
| 10회 선불권 상품 시스템 | 정기 구독 (월간 무제한 등) |
| 회원 가입 정책 변경 | 포인트 시스템 |
| 선불권 구매/사용/환불 | 자동 결제 |
| 관련 UI/UX 변경 | 모바일 앱 |

---

## 2. 회원 정책 변경

### 2.1 현재 (AS-IS)

| 항목 | 내용 |
|------|------|
| 가입 자격 | 세대 회원만 (201~501호) |
| 가입 양식 | 이름, 전화번호, 세대 번호 (필수) |
| 승인 방식 | 관리자 승인 필요 |

### 2.2 변경 (TO-BE)

| 항목 | 내용 |
|------|------|
| 가입 자격 | **누구나** 가입 가능 |
| 가입 양식 | 이름, 전화번호, 세대원 여부 (체크박스), 세대 번호 (세대원인 경우만) |
| 승인 방식 | 관리자 승인 필요 (동일) |

### 2.3 회원 유형

| 유형 | 설명 | 예약 혜택 |
|------|------|----------|
| **세대 회원** | 세대원 여부 ✓ + 세대 번호 입력 | 월 8시간 무료 |
| **일반 회원** | 세대원 여부 ✗ | 14,000원/시간 (선불권 사용 가능) |

### 2.4 회원가입 양식 변경

```
기존:
- 이름 (필수)
- 전화번호 (필수)  
- 세대 번호 (필수, 드롭다운: 201~501호)

변경:
- 이름 (필수)
- 전화번호 (필수)
- 세대원 여부 (체크박스)
  ☐ 저는 온음 세대 입주민입니다
- 세대 번호 (세대원 체크 시에만 노출, 드롭다운: 201~501호)
```

---

## 3. 선불권 상품 명세

### 3.1 상품 정보

| 항목 | 내용 |
|------|------|
| 상품명 | 10회 선불권 |
| 가격 | **100,000원** |
| 정상가 | 140,000원 (14,000원 × 10회) |
| 할인율 | 약 29% (40,000원 할인) |
| 구성 | 1시간 예약권 × 10회 |
| 유효기간 | 구매 확정일로부터 **6개월** |

### 3.2 구매 자격

- **로그인한 회원**만 구매 가능
- 세대 회원, 일반 회원 모두 가능
- 비로그인 상태에서는 구매 불가 (로그인 유도)

### 3.3 구매 프로세스

```
┌──────────────────────────────────────────────────────────────┐
│  [구매 신청]  →  [입금 안내 SMS]  →  [입금]  →  [관리자 확인]  │
│                                                              │
│       ↓               ↓              ↓            ↓         │
│   prepaid_purchases  SMS 발송      은행 입금    상태 변경     │
│   status: pending                             status: active │
│                                               valid_until 설정│
└──────────────────────────────────────────────────────────────┘
```

1. **신청**: 회원이 선불권 구매 신청 (상품 선택)
2. **입금 안내**: SMS로 입금 계좌 및 금액 안내
3. **입금**: 회원이 지정 계좌로 입금
4. **확인**: 관리자가 입금 확인 후 선불권 활성화
5. **완료**: SMS로 구매 완료 및 사용 안내

### 3.4 사용 규칙

| 규칙 | 설명 |
|------|------|
| 1회 = 1시간 | 1회 사용 시 1시간 예약 가능 |
| 연속 예약 | 선불권 2회 사용 → 2시간 연속 예약 가능 |
| 혼합 예약 | 선불권 + 일반 예약 조합 가능 |
| 공간 제한 | 놀터, 방음실 모두 사용 가능 |
| 중복 구매 | 가능 (여러 개 선불권 보유 가능) |

### 3.5 혼합 예약 예시

```
상황: 선불권 1회 남음, 2시간 연속 예약 원함

예약 시:
├─ 첫 번째 1시간: 선불권 1회 자동 소진
└─ 두 번째 1시간: 일반 유료 예약 (14,000원)

→ 결과: 선불권 0회 + 14,000원 결제 대기
```

### 3.6 유효기간 정책

- **시작**: 관리자 입금 확인 완료 시점
- **기간**: 6개월
- **만료 시**: 미사용 회차 자동 소멸 (환불 불가)
- **알림**: 만료 30일 전, 7일 전 SMS 안내 (Phase 2)

### 3.7 환불 정책

| 조건 | 환불 금액 |
|------|----------|
| 미사용 | 100,000원 전액 |
| 1회 사용 | 100,000 - (1 × 14,000) = **86,000원** |
| 2회 사용 | 100,000 - (2 × 14,000) = **72,000원** |
| ... | ... |
| 7회 사용 | 100,000 - (7 × 14,000) = **2,000원** |
| 8회 이상 | 환불 불가 (이미 혜택 소진) |

> **환불 계산 공식**: `환불액 = 100,000 - (사용회수 × 14,000원)`
> 
> 사용한 회차는 정상가(14,000원)로 정산

---

## 4. DB 스키마 설계

### 4.1 users 테이블 변경

```sql
-- 세대원 여부 컬럼 추가
ALTER TABLE users 
  ADD COLUMN IF NOT EXISTS is_resident BOOLEAN DEFAULT false;

-- household 컬럼을 NULL 허용으로 변경 (일반 회원은 세대 없음)
ALTER TABLE users 
  ALTER COLUMN household DROP NOT NULL;

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_is_resident ON users(is_resident);
```

### 4.2 signups 테이블 변경

```sql
-- 세대원 여부 컬럼 추가
ALTER TABLE signups 
  ADD COLUMN IF NOT EXISTS is_resident BOOLEAN DEFAULT false;

-- household 컬럼을 NULL 허용으로 변경
ALTER TABLE signups 
  ALTER COLUMN household DROP NOT NULL;
```

### 4.3 prepaid_products 테이블 (선불권 상품)

```sql
CREATE TABLE prepaid_products (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 상품 정보
  name VARCHAR(100) NOT NULL,              -- '10회 선불권'
  description TEXT,                         -- 상품 설명
  
  -- 가격 및 구성
  price INTEGER NOT NULL,                   -- 100000 (원)
  original_price INTEGER NOT NULL,          -- 140000 (정상가)
  total_hours INTEGER NOT NULL,             -- 10 (총 시간)
  
  -- 유효기간
  validity_months INTEGER NOT NULL DEFAULT 6,  -- 6개월
  
  -- 상태
  is_active BOOLEAN DEFAULT true,           -- 판매 중 여부
  display_order INTEGER DEFAULT 0,          -- 표시 순서
  
  -- 메타
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 초기 데이터
INSERT INTO prepaid_products (name, description, price, original_price, total_hours, validity_months) 
VALUES (
  '10회 선불권',
  '1시간 예약 × 10회 (정가 140,000원 → 100,000원, 약 29% 할인)',
  100000,
  140000,
  10,
  6
);
```

### 4.4 prepaid_purchases 테이블 (구매 내역)

```sql
CREATE TABLE prepaid_purchases (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 구매자
  user_id UUID NOT NULL REFERENCES users(id),
  product_id UUID NOT NULL REFERENCES prepaid_products(id),
  
  -- 구매 정보
  amount INTEGER NOT NULL,                  -- 결제 금액
  total_hours INTEGER NOT NULL,             -- 구매한 총 시간
  used_hours INTEGER DEFAULT 0,             -- 사용한 시간
  remaining_hours INTEGER GENERATED ALWAYS AS (total_hours - used_hours) STORED,
  
  -- 유효기간
  valid_from TIMESTAMP WITH TIME ZONE,      -- 유효 시작일 (입금 확인 시점)
  valid_until TIMESTAMP WITH TIME ZONE,     -- 유효 종료일
  
  -- 상태
  status VARCHAR(20) DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'expired', 'refunded', 'cancelled')),
  -- pending: 입금 대기
  -- active: 사용 가능
  -- expired: 만료됨
  -- refunded: 환불됨
  -- cancelled: 취소됨
  
  -- 결제
  payment_status VARCHAR(20) DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'completed')),
  payment_confirmed_at TIMESTAMP WITH TIME ZONE,
  payment_confirmed_by UUID REFERENCES admin_users(id),
  
  -- 환불
  refund_amount INTEGER,                    -- 환불 금액
  refund_reason TEXT,
  refunded_at TIMESTAMP WITH TIME ZONE,
  refunded_by UUID REFERENCES admin_users(id),
  
  -- 메타
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_prepaid_purchases_user ON prepaid_purchases(user_id);
CREATE INDEX idx_prepaid_purchases_status ON prepaid_purchases(status);
CREATE INDEX idx_prepaid_purchases_valid ON prepaid_purchases(valid_until) 
  WHERE status = 'active';

-- RLS
ALTER TABLE prepaid_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own purchases" ON prepaid_purchases
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Admin can manage all purchases" ON prepaid_purchases
  FOR ALL USING (true);
```

### 4.5 prepaid_usages 테이블 (사용 내역)

```sql
CREATE TABLE prepaid_usages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 연관
  purchase_id UUID NOT NULL REFERENCES prepaid_purchases(id),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  
  -- 사용 정보
  hours_used INTEGER NOT NULL DEFAULT 1,    -- 사용 시간 (기본 1시간)
  
  -- 메타
  used_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX idx_prepaid_usages_purchase ON prepaid_usages(purchase_id);
CREATE INDEX idx_prepaid_usages_booking ON prepaid_usages(booking_id);

-- RLS
ALTER TABLE prepaid_usages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own usages" ON prepaid_usages
  FOR SELECT USING (
    purchase_id IN (
      SELECT id FROM prepaid_purchases WHERE user_id = auth.uid()
    )
  );
```

### 4.6 bookings 테이블 변경

```sql
-- 선불권 사용 여부 및 혼합 예약 지원
ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS prepaid_hours_used INTEGER DEFAULT 0;

ALTER TABLE bookings 
  ADD COLUMN IF NOT EXISTS regular_hours INTEGER DEFAULT 0;

-- 기존 amount 컬럼은 유지 (일반 결제 금액)
```

### 4.7 ER 다이어그램

```
┌─────────────────┐     ┌─────────────────────┐
│ prepaid_products│     │       users         │
├─────────────────┤     ├─────────────────────┤
│ id (PK)         │     │ id (PK)             │
│ name            │     │ name                │
│ price           │     │ phone               │
│ original_price  │     │ is_resident (NEW)   │◀─── 세대원 여부
│ total_hours     │     │ household (nullable)│
│ validity_months │     │ ...                 │
└────────┬────────┘     └──────────┬──────────┘
         │                         │
         │                         │
         ▼                         ▼
┌────────────────────────────────────────┐
│          prepaid_purchases             │
├────────────────────────────────────────┤
│ id (PK)                                │
│ user_id (FK → users)                   │
│ product_id (FK → prepaid_products)     │
│ amount, total_hours, used_hours        │
│ remaining_hours (computed)             │
│ valid_from, valid_until                │
│ status, payment_status                 │
└────────────────────┬───────────────────┘
                     │
                     │ 1:N
                     ▼
         ┌─────────────────────┐
         │  prepaid_usages     │
         ├─────────────────────┤
         │ id (PK)             │
         │ purchase_id (FK)    │
         │ booking_id (FK)     │──────▶ bookings
         │ hours_used          │
         │ used_at             │
         └─────────────────────┘
```

---

## 5. UI/UX 변경사항

### 5.1 메인 페이지 (/)

#### 5.1.1 선불권 구매 버튼 추가

```
┌──────────────────────────────────────────┐
│            온음 공간 예약                  │
│                                          │
│  ┌────────────┐  ┌────────────────┐      │
│  │  회원 로그인 │  │ 🎫 선불권 구매  │ ◀── NEW
│  └────────────┘  └────────────────┘      │
│                                          │
│  ┌────────────────────────────────┐      │
│  │        놀터 예약하기            │      │
│  └────────────────────────────────┘      │
│                                          │
│  ┌────────────────────────────────┐      │
│  │       방음실 예약하기           │      │
│  └────────────────────────────────┘      │
└──────────────────────────────────────────┘
```

**버튼 위치**: 회원 로그인 버튼 옆 (또는 하단)
**노출 조건**: 항상 노출 (비로그인 상태에서도 보임)

#### 5.1.2 선불권 구매 팝업 (모달)

**비로그인 상태 클릭 시:**

```
┌────────────────────────────────────────┐
│                  ✕                     │
│                                        │
│      🎫 10회 선불권                     │
│                                        │
│   100,000원 (정가 140,000원)           │
│   1시간 × 10회 | 유효기간 6개월         │
│                                        │
│   ────────────────────────             │
│                                        │
│   선불권 구매는 회원만 가능합니다.        │
│                                        │
│   ┌──────────┐  ┌──────────┐          │
│   │  로그인   │  │ 회원가입  │          │
│   └──────────┘  └──────────┘          │
│                                        │
└────────────────────────────────────────┘
```

**로그인 상태 클릭 시:**

```
┌────────────────────────────────────────┐
│                  ✕                     │
│                                        │
│      🎫 10회 선불권 구매                 │
│                                        │
│   ┌──────────────────────────────┐    │
│   │  10회 선불권                  │    │
│   │  100,000원 (정가 140,000원)   │    │
│   │  • 1시간 × 10회              │    │
│   │  • 유효기간: 구매 후 6개월    │    │
│   │  • 놀터/방음실 모두 사용 가능  │    │
│   └──────────────────────────────┘    │
│                                        │
│   📋 구매 안내                          │
│   1. 구매 신청 후 SMS로 입금 안내       │
│   2. 입금 확인 후 바로 사용 가능        │
│                                        │
│   ┌────────────────────────────┐      │
│   │      🎫 구매 신청하기        │      │
│   └────────────────────────────┘      │
│                                        │
└────────────────────────────────────────┘
```

### 5.2 회원가입 폼 변경 (/signup)

```
┌────────────────────────────────────────┐
│           온음 회원가입                  │
│                                        │
│   이름                                  │
│   ┌──────────────────────────────┐    │
│   │                              │    │
│   └──────────────────────────────┘    │
│                                        │
│   전화번호                              │
│   ┌──────────────────────────────┐    │
│   │                              │    │
│   └──────────────────────────────┘    │
│                                        │
│   ☐ 저는 온음 세대 입주민입니다   ◀── NEW │
│                                        │
│   세대 번호  (체크 시에만 노출)  ◀── NEW │
│   ┌──────────────────────────────┐    │
│   │  선택하세요            ▼     │    │
│   └──────────────────────────────┘    │
│                                        │
│   ┌────────────────────────────┐      │
│   │         가입 신청           │      │
│   └────────────────────────────┘      │
│                                        │
└────────────────────────────────────────┘
```

### 5.3 예약 화면 변경

#### 5.3.1 선불권 보유자 - 예약 시간 선택 UI

```
┌────────────────────────────────────────┐
│        놀터 예약                        │
│                                        │
│   🎫 보유 선불권: 7회 (7시간) 남음       │◀── NEW
│                                        │
│   📅 2026년 4월 10일 (금)              │
│                                        │
│   시간 선택:                            │
│   ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│   │09시│ │10시│ │11시│ │12시│ ...     │
│   └────┘ └────┘ └────┘ └────┘        │
│                                        │
│   ✓ 10:00 ~ 12:00 (2시간)             │
│                                        │
│   💳 결제 정보:                         │◀── NEW
│   ├─ 선불권 사용: 2회                   │
│   └─ 남은 선불권: 5회                   │
│                                        │
│   ┌────────────────────────────┐      │
│   │         예약하기            │      │
│   └────────────────────────────┘      │
│                                        │
└────────────────────────────────────────┘
```

#### 5.3.2 혼합 예약 (선불권 부족 시)

```
┌────────────────────────────────────────┐
│        놀터 예약                        │
│                                        │
│   🎫 보유 선불권: 1회 (1시간) 남음       │
│                                        │
│   📅 2026년 4월 10일 (금)              │
│                                        │
│   ✓ 10:00 ~ 12:00 (2시간)             │
│                                        │
│   💳 결제 정보:                         │
│   ├─ 선불권 사용: 1회 (10:00~11:00)    │
│   ├─ 일반 예약: 1시간 (11:00~12:00)    │
│   └─ 결제 금액: 14,000원               │
│                                        │
│   ⚠️ 선불권 1회 소진 후 나머지는         │
│      일반 예약으로 처리됩니다.            │
│                                        │
│   ┌────────────────────────────┐      │
│   │         예약하기            │      │
│   └────────────────────────────┘      │
│                                        │
└────────────────────────────────────────┘
```

### 5.4 마이페이지 (/mypage)

```
┌────────────────────────────────────────┐
│           마이페이지                    │
│                                        │
│   👤 홍길동님                           │
│   📱 010-1234-5678                     │
│   🏠 일반 회원 (또는: 301호 세대 회원)   │
│                                        │
│   ─────────────────────────────────    │
│                                        │
│   🎫 보유 선불권                    NEW │
│   ┌──────────────────────────────┐    │
│   │ 10회 선불권 #1               │    │
│   │ 잔여: 7/10회                 │    │
│   │ 유효기간: 2026-10-02까지     │    │
│   │ ▓▓▓▓▓▓▓░░░ 70%              │    │
│   └──────────────────────────────┘    │
│   ┌──────────────────────────────┐    │
│   │ 10회 선불권 #2               │    │
│   │ 잔여: 10/10회 (미사용)        │    │
│   │ 유효기간: 2026-12-15까지     │    │
│   │ ▓▓▓▓▓▓▓▓▓▓ 100%             │    │
│   └──────────────────────────────┘    │
│                                        │
│   ┌────────────────────────────┐      │
│   │      🎫 선불권 추가 구매     │      │
│   └────────────────────────────┘      │
│                                        │
│   ─────────────────────────────────    │
│                                        │
│   📋 내 예약 목록                       │
│   ...                                  │
│                                        │
└────────────────────────────────────────┘
```

### 5.5 관리자 페이지

#### 5.5.1 선불권 관리 메뉴 추가 (/admin/prepaid)

```
┌────────────────────────────────────────┐
│   🎫 선불권 관리                        │
│                                        │
│   [대기 중] [활성] [만료] [환불]         │
│                                        │
│   ─────────────────────────────────    │
│                                        │
│   ┌─────────────────────────────────┐ │
│   │ 신청자: 홍길동 (010-1234-5678)  │ │
│   │ 상품: 10회 선불권               │ │
│   │ 금액: 100,000원                │ │
│   │ 신청일: 2026-04-02 10:30       │ │
│   │                                │ │
│   │ [입금 확인] [취소]              │ │
│   └─────────────────────────────────┘ │
│                                        │
└────────────────────────────────────────┘
```

#### 5.5.2 환불 처리 UI

```
┌────────────────────────────────────────┐
│   💰 선불권 환불                        │
│                                        │
│   구매자: 홍길동 (010-1234-5678)        │
│   상품: 10회 선불권                     │
│   구매일: 2026-04-02                   │
│                                        │
│   총 구매: 10회                         │
│   사용: 3회                             │
│   잔여: 7회                             │
│                                        │
│   ─────────────────────────────────    │
│                                        │
│   환불 계산:                            │
│   구매금액: 100,000원                   │
│   사용금액: 3회 × 14,000원 = 42,000원   │
│   환불금액: 58,000원                    │
│                                        │
│   환불 사유:                            │
│   ┌──────────────────────────────┐    │
│   │                              │    │
│   └──────────────────────────────┘    │
│                                        │
│   ┌────────────────────────────┐      │
│   │       환불 처리하기          │      │
│   └────────────────────────────┘      │
│                                        │
└────────────────────────────────────────┘
```

---

## 6. 예약 플로우 변경

### 6.1 기존 플로우 (AS-IS)

```
회원:
[시간 선택] → [예약 확정] → 무료 (월 8시간 내)
                         → 유료 (초과 시)

비회원:
[시간 선택] → [예약 생성] → [입금 안내 SMS] → [입금] → [입금 확인] → [예약 확정]
```

### 6.2 변경 플로우 (TO-BE)

```
세대 회원:
[시간 선택] → [예약 확정] → 무료 (월 8시간 내)
                         → 유료 (초과 시)
                         → 선불권 사용 (보유 시)

일반 회원:
[시간 선택] → [결제 방식 확인]
              ├─ 선불권 있음 → [선불권 자동 차감] → [예약 확정]
              ├─ 선불권 부족 → [혼합 예약] → [잔여 입금 안내] → [예약 확정]
              └─ 선불권 없음 → [입금 안내 SMS] → [입금] → [예약 확정]

비회원:
[시간 선택] → [입금 안내 SMS] → [입금] → [예약 확정]
(변경 없음)
```

### 6.3 예약 생성 로직 (Pseudo Code)

```javascript
async function createBooking(user, selectedHours) {
  // 1. 세대 회원 월 무료 시간 체크
  if (user.is_resident) {
    const monthlyUsage = await getMonthlyUsage(user.household);
    const freeHoursLeft = 8 - monthlyUsage;
    
    if (selectedHours <= freeHoursLeft) {
      return createFreeBooking(user, selectedHours);
    }
  }
  
  // 2. 선불권 보유 체크
  const activePrepaid = await getActivePrepaidPurchases(user.id);
  const totalRemainingHours = activePrepaid.reduce((sum, p) => sum + p.remaining_hours, 0);
  
  if (totalRemainingHours >= selectedHours) {
    // 전체를 선불권으로 처리
    return createPrepaidBooking(user, selectedHours, activePrepaid);
  } else if (totalRemainingHours > 0) {
    // 혼합 예약 (선불권 + 일반)
    const prepaidHours = totalRemainingHours;
    const regularHours = selectedHours - prepaidHours;
    return createMixedBooking(user, prepaidHours, regularHours, activePrepaid);
  } else {
    // 일반 유료 예약
    return createPaidBooking(user, selectedHours);
  }
}
```

### 6.4 선불권 차감 우선순위

1. **유효기간 임박 순**: 만료일이 가까운 선불권부터 사용
2. **잔여 회수 적은 순**: 남은 회수가 적은 선불권부터 사용

```sql
-- 차감 우선순위 쿼리
SELECT * FROM prepaid_purchases
WHERE user_id = $1 
  AND status = 'active'
  AND valid_until > NOW()
  AND remaining_hours > 0
ORDER BY valid_until ASC, remaining_hours ASC;
```

---

## 7. SMS 메시지 설계

> ⚠️ **Note**: SMS 메시지 상세 설계는 선불권 시스템 및 회원 시스템 변경 완료 후 진행합니다.

### 7.1 신규 메시지 타입

| 코드 | 이름 | 수신자 | 발송 시점 |
|------|------|--------|----------|
| **7-1** | 선불권 신청 (입금 안내) | 회원 | 선불권 구매 신청 시 |
| **7-2** | 선불권 구매 완료 | 회원 | 관리자 입금 확인 시 |
| **7-3** | 선불권 사용 예약 완료 | 회원 | 선불권으로 예약 시 |
| **7-4** | 선불권 만료 예정 | 회원 | 만료 30일 전, 7일 전 |
| **7-5** | 선불권 환불 완료 | 회원 | 환불 처리 시 |
| **7-6** | 선불권 신청 알림 | 관리자 | 신규 신청 시 |

### 7.2 메시지 템플릿 (초안)

#### 7-1: 선불권 신청 (입금 안내)
```
{name}님, 10회 선불권 구매 신청이 완료되었습니다!

💰 금액: 100,000원
🏦 입금계좌: {account}

입금 확인 후 바로 사용하실 수 있습니다.

감사합니다! 🎵
```

#### 7-2: 선불권 구매 완료
```
{name}님, 10회 선불권 구매가 완료되었습니다!

🎫 10회 선불권
✅ 사용 가능: 10회
📅 유효기간: {valid_until}까지

지금 바로 예약하세요!
온음: {url}
```

#### 7-3: 선불권 사용 예약 완료
```
{name}님, 예약이 완료되었습니다!

📅 날짜: {date}
⏰ 시간: {time}
📍 공간: {space}

🎫 선불권 {used}회 사용
   남은 선불권: {remaining}회

즐거운 시간 보내세요! 🎵
```

---

## 8. 개발 단계

### Phase 6.1: 회원 정책 변경 (1일)

- [ ] `users` 테이블에 `is_resident` 컬럼 추가
- [ ] `signups` 테이블에 `is_resident` 컬럼 추가
- [ ] 회원가입 폼 UI 변경 (세대원 여부 체크박스)
- [ ] 관리자 회원 관리 UI에 회원 유형 표시

**배포 체크리스트:**
- [ ] Supabase 마이그레이션 실행
- [ ] 회원가입 테스트 (세대 회원 / 일반 회원)
- [ ] 기존 회원 데이터 마이그레이션 (모두 `is_resident = true`)

### Phase 6.2: 선불권 DB 및 기본 API (2일)

- [ ] `prepaid_products` 테이블 생성
- [ ] `prepaid_purchases` 테이블 생성
- [ ] `prepaid_usages` 테이블 생성
- [ ] 선불권 API 구현
  - [ ] `POST /api/prepaid/purchase` - 구매 신청
  - [ ] `GET /api/prepaid/my` - 내 선불권 조회
  - [ ] `POST /api/prepaid/confirm` - 입금 확인 (관리자)
  - [ ] `POST /api/prepaid/refund` - 환불 처리 (관리자)

### Phase 6.3: 메인 페이지 및 구매 UI (1일)

- [ ] 메인 페이지에 "선불권 구매" 버튼 추가
- [ ] 선불권 구매 모달 구현
  - [ ] 비로그인: 로그인 유도
  - [ ] 로그인: 구매 신청 폼
- [ ] 구매 신청 완료 후 처리

### Phase 6.4: 마이페이지 (1일)

- [ ] 마이페이지에 보유 선불권 섹션 추가
- [ ] 선불권 목록 표시 (잔여/유효기간)
- [ ] 선불권 추가 구매 버튼

### Phase 6.5: 예약 플로우 연동 (2일)

- [ ] 예약 화면에 선불권 정보 표시
- [ ] 선불권 자동 차감 로직 구현
- [ ] 혼합 예약 (선불권 + 일반) 처리
- [ ] `bookings` 테이블에 선불권 사용 정보 기록

### Phase 6.6: 관리자 기능 (1일)

- [ ] `/admin/prepaid` 선불권 관리 페이지
- [ ] 입금 확인 처리
- [ ] 환불 처리

### Phase 6.7: SMS 연동 (1일)

- [ ] 메시지 템플릿 추가 (7-1 ~ 7-6)
- [ ] 선불권 관련 SMS 발송 로직 구현
- [ ] 테스트

### 총 예상 기간: 9일

```
Phase 6.1 (1일) ─┐
                 ├─▶ Phase 6.2 (2일) ─┐
                                      ├─▶ Phase 6.3 (1일)
                                      ├─▶ Phase 6.4 (1일)
                                      ├─▶ Phase 6.5 (2일) ─▶ Phase 6.7 (1일)
                                      └─▶ Phase 6.6 (1일)
```

---

## 9. 테스트 시나리오

### 9.1 회원가입 테스트

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| S1 | 세대원 체크 + 세대 선택 → 가입 | 세대 회원으로 가입 신청 |
| S2 | 세대원 미체크 → 가입 | 일반 회원으로 가입 신청 |
| S3 | 세대원 체크 + 세대 미선택 | 에러: "세대를 선택해주세요" |

### 9.2 선불권 구매 테스트

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| P1 | 비로그인 → 선불권 버튼 클릭 | 로그인 유도 팝업 |
| P2 | 로그인 → 구매 신청 | 입금 대기 상태로 생성, SMS 발송 |
| P3 | 관리자 → 입금 확인 | status: active, 유효기간 설정 |
| P4 | 중복 구매 시도 | 정상 처리 (여러 선불권 보유 가능) |

### 9.3 예약 + 선불권 사용 테스트

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| B1 | 선불권 7회 보유 → 2시간 예약 | 선불권 2회 차감 → 5회 남음 |
| B2 | 선불권 1회 보유 → 3시간 예약 | 선불권 1회 + 일반 2시간 (28,000원) |
| B3 | 선불권 0회 → 예약 | 전체 유료 예약 |
| B4 | 만료된 선불권만 보유 → 예약 | 전체 유료 예약 (만료권 무시) |

### 9.4 환불 테스트

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| R1 | 미사용 10회 → 환불 | 100,000원 전액 |
| R2 | 3회 사용 후 환불 | 58,000원 환불 |
| R3 | 8회 사용 후 환불 | 환불 불가 (이미 혜택 소진) |

### 9.5 유효기간 테스트

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| E1 | 유효기간 내 예약 | 정상 사용 |
| E2 | 유효기간 지난 선불권 | 자동 만료 처리, 사용 불가 |
| E3 | 만료 30일 전 | 알림 SMS 발송 |

---

## 📝 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|----------|
| 1.0 | 2026-04-02 | 버즈 | 초안 작성 |

---

## ✅ 승인

| 역할 | 이름 | 서명 | 날짜 |
|------|------|------|------|
| Product Owner | 우디 | | |
| Tech Lead | | | |
