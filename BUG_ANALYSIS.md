# 선불권 구매 버그 분석 보고서

## 날짜: 2026-04-02

## 🐛 버그 증상
- 선불권 구매 모달에서 "구매 신청하기" 버튼 클릭 시
- Alert는 뜨지만 실제 API 호출이 안 되거나
- API 호출은 성공하지만 DB에 저장 안 됨

## 🔍 분석 과정

### 1단계: 코드 분석
- ✅ `PrepaidPurchaseModal.tsx`: handlePurchase 함수 확인
- ✅ `app/page.tsx`: userSession props 전달 확인
- ✅ `app/actions/auth.ts`: login 함수에서 user.id 반환 확인
- ✅ `/api/prepaid/purchase/route.ts`: API 로직 확인

### 2단계: 디버깅 로그 추가
**파일**: `app/components/PrepaidPurchaseModal.tsx`

추가된 로그:
- 🛒 handlePurchase 실행 확인
- 🛒 productId, userSession, userId 상태 확인
- 🚀 API 호출 시작
- 📤 Request body 로깅
- 📥 Response status & data 로깅
- ✅ 구매 완료 / ❌ 실패 로깅

### 3단계: 실제 테스트 (테디세대원 계정)
**결과**:
```
🛒 [PURCHASE] userSession.userId: 102cffb9-eaaf-4309-a59a-bd52b20fc50d ✅
🚀 [PURCHASE] API 호출 시작 ✅
📤 [PURCHASE] Request body: {product_id: ..., user_id: ...} ✅
📥 [PURCHASE] Response status: 200 ✅
📥 [PURCHASE] Response data: {success: true, purchase: Object, ...} ✅
✅ [PURCHASE] 구매 완료 ✅
```

**하지만**:
```
GET /api/prepaid/my-purchases?user_id=102cffb9-eaaf-4309-a59a-bd52b20fc50d
→ { success: true, purchases: [] } ❌
```

## 🎯 원인 분석

### 확인된 사항
1. ✅ userId는 localStorage에 제대로 저장됨
2. ✅ PrepaidPurchaseModal에 userSession props 제대로 전달됨
3. ✅ API 호출 성공 (status 200)
4. ✅ API Response에 purchase 객체 포함됨
5. ❌ **DB 조회 시 purchase가 없음**

### 가능한 원인

#### 1. Supabase RLS (Row Level Security) 정책 문제
- INSERT는 성공하지만 SELECT 권한이 없어서 조회 안 될 수 있음
- `prepaid_purchases` 테이블의 RLS 정책 확인 필요

#### 2. 서비스 롤 클라이언트 vs 익명 클라이언트 차이
- `createServiceRoleClient()`는 RLS 우회
- 클라이언트 측 fetch는 익명 요청 (RLS 적용)
- 정책 불일치로 조회 실패 가능

#### 3. DB 저장 실패 (에러 핸들링 미흡)
- API는 success 응답을 주지만
- 실제 INSERT는 실패했을 가능성
- purchase API의 에러 로깅 강화 필요

## 🛠️ 수정 완료
- ✅ 디버깅 로그 추가 (`PrepaidPurchaseModal.tsx`)
- ✅ Git commit & push
- ✅ Vercel 배포 완료

## 📋 다음 작업 필요
1. **Supabase RLS 정책 확인**
   - `prepaid_purchases` 테이블의 SELECT 정책
   - user_id 기반 조회 권한 확인

2. **purchase API 에러 로깅 강화**
   ```typescript
   const { data: purchase, error: purchaseError } = await supabase
     .from('prepaid_purchases')
     .insert(...)
     .select()
     .single()
   
   console.log('🔍 [DEBUG] INSERT result:', { purchase, purchaseError })
   ```

3. **DB 직접 확인**
   - Supabase 대시보드에서 `prepaid_purchases` 테이블 확인
   - user_id = '102cffb9-eaaf-4309-a59a-bd52b20fc50d' 레코드 존재 여부

4. **테스트 재실행**
   - 구매 → 즉시 조회 → DB 확인
   - Vercel 로그 확인

## 📊 테스트 결과 요약
| 항목 | 상태 | 비고 |
|------|------|------|
| Modal 표시 | ✅ | 정상 |
| 버튼 클릭 | ✅ | 정상 |
| userId 전달 | ✅ | localStorage & props 확인 |
| API 호출 | ✅ | status 200, success: true |
| DB 저장 | ❌ | 조회 시 0건 |
| Alert 표시 | ✅ | 정상 |

## 🔗 관련 파일
- `app/components/PrepaidPurchaseModal.tsx` (수정됨)
- `app/api/prepaid/purchase/route.ts`
- `app/api/prepaid/my-purchases/route.ts`
- `app/actions/auth.ts`
- `app/page.tsx`

## 커밋 히스토리
- `813be2e`: Debug: 선불권 구매 API 호출 디버깅 로그 추가
