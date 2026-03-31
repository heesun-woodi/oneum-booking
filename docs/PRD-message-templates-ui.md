# PRD: 메시지 템플릿 관리 UI

> **목표**: 관리자가 웹 UI에서 SMS 메시지 템플릿을 CRUD하고, 테스트 발송할 수 있도록 함
> **작성일**: 2026-03-31
> **Status**: Ready for Development

---

## 1. 현재 상태 분석

### 하드코딩된 템플릿 (15개)
```
lib/notifications/templates.ts
├── 회원가입: 1-2 (승인), 1-3 (거부)
├── 예약: 2-1 (완료), 2-2 (입금안내), 2-3 (취소)
├── 입금: 3-1 (확인), 3-2 (안내)
├── 리마인더: 4-1 (내일D-1), 4-2 (오늘D-Day), 4-3 (내일세대포함)
├── 재무: 5-2 (미입금알림), 5-3 (환불안내)
└── 관리자: 6-1 (가입신청알림)
```

### 변수 시스템
- `{name}`, `{household}`, `{date}`, `{time}`, `{space}` 등
- 발송 시 `TemplateVariables` 객체로 치환

---

## 2. DB 스키마

### `message_templates` 테이블

```sql
-- supabase/migrations/003_message_templates.sql

CREATE TABLE IF NOT EXISTS message_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- 식별
  type_code VARCHAR(10) NOT NULL UNIQUE,   -- '1-2', '2-1' 등
  category VARCHAR(20) NOT NULL,            -- 'signup', 'booking', 'payment', 'reminder', 'finance', 'admin'
  name VARCHAR(100) NOT NULL,               -- '가입 승인', '예약 완료' 등
  
  -- 템플릿 내용
  title VARCHAR(100) NOT NULL,              -- '[온음] 가입 승인'
  content TEXT NOT NULL,                    -- 메시지 본문 (변수 포함)
  
  -- 설정
  is_active BOOLEAN DEFAULT true,           -- 발송 ON/OFF
  variables TEXT[] DEFAULT '{}',            -- 사용 변수 목록 ['name', 'household']
  
  -- 메타
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_templates_type ON message_templates(type_code);
CREATE INDEX IF NOT EXISTS idx_templates_category ON message_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_active ON message_templates(is_active);

-- RLS
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin can manage templates" ON message_templates 
  FOR ALL USING (true);

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
```

### 초기 데이터 마이그레이션

```sql
-- 기존 15개 템플릿 INSERT
INSERT INTO message_templates (type_code, category, name, title, content, variables) VALUES
-- 회원가입
('1-2', 'signup', '가입 승인', '[온음] 가입 승인', 
 E'{name}님, 안녕하세요!\n\n온음 회원 가입이 승인되었습니다.\n\n세대: {household}호\n로그인 후 바로 예약하실 수 있습니다.\n\n온음과 함께 즐거운 시간 보내세요! 🎵',
 ARRAY['name', 'household']),
 
('1-3', 'signup', '가입 거부', '[온음] 가입 거부',
 E'{name}님, 안녕하세요.\n\n온음 회원 가입이 승인되지 않았습니다.\n\n사유: {reason}\n\n문의사항이 있으시면 관리자에게 연락 부탁드립니다.',
 ARRAY['name', 'reason']),

-- 예약
('2-1', 'booking', '예약 완료 (회원)', '[온음] 예약 완료',
 E'{name}님({household}호), 예약이 완료되었습니다!\n\n📅 날짜: {date}\n⏰ 시간: {time}\n📍 공간: {space}\n\n즐거운 시간 보내세요! 🎵',
 ARRAY['name', 'household', 'date', 'time', 'space']),

('2-2', 'booking', '예약 완료 (입금안내)', '[온음] 예약 완료 (입금 안내)',
 E'{name}님, 예약이 완료되었습니다!\n\n📅 날짜: {date}\n⏰ 시간: {time}\n📍 공간: {space}\n💰 금액: {amount}원\n\n[입금 정보]\n계좌: {account}\n입금 기한: {deadline} 23:59까지\n\n* 기한 내 미입금 시 자동 취소됩니다.\n\n감사합니다! 🎵',
 ARRAY['name', 'date', 'time', 'space', 'amount', 'account', 'deadline']),

('2-3', 'booking', '예약 취소', '[온음] 예약 취소',
 E'{name}님, 예약이 취소되었습니다.\n\n📅 날짜: {date}\n⏰ 시간: {time}\n📍 공간: {space}\n\n다음에 또 이용해 주세요!',
 ARRAY['name', 'date', 'time', 'space']),

-- 입금
('3-1', 'payment', '입금 확인', '[온음] 입금 확인',
 E'{name}님, 입금이 확인되었습니다!\n\n📅 날짜: {date}\n⏰ 시간: {time}\n📍 공간: {space}\n\n예약이 최종 확정되었습니다.\n이용 당일 뵙겠습니다! 🎵',
 ARRAY['name', 'date', 'time', 'space']),

('3-2', 'payment', '입금 안내', '[온음] 입금 안내',
 E'{name}님, 입금 확인 요청드립니다.\n\n📅 예약일: {date}\n💰 금액: {amount}원\n계좌: {account}\n\n입금 기한: {deadline} 23:59까지\n\n* 기한 내 미입금 시 자동 취소됩니다.\n\n감사합니다!',
 ARRAY['name', 'date', 'amount', 'account', 'deadline']),

-- 리마인더
('4-1', 'reminder', '내일 예약 안내', '[온음] 내일 예약 안내',
 E'{name}님, 내일 예약 안내드립니다!\n\n📅 날짜: {date}\n⏰ 시간: {time}\n📍 공간: {space}\n\n즐거운 시간 보내세요! 🎵',
 ARRAY['name', 'date', 'time', 'space']),

('4-2', 'reminder', '오늘 예약 안내', '[온음] 오늘 예약 안내',
 E'{name}님, 오늘 예약이 있습니다!\n\n📅 오늘\n⏰ 시간: {time}\n📍 공간: {space}\n\n🎵',
 ARRAY['name', 'time', 'space']),

('4-3', 'reminder', '내일 예약 안내 (세대)', '[온음] 내일 예약 안내',
 E'{name}님({household}호), 내일 예약 안내드립니다!\n\n📅 날짜: {date}\n⏰ 시간: {time}\n📍 공간: {space}\n\n즐거운 시간 보내세요! 🎵',
 ARRAY['name', 'household', 'date', 'time', 'space']),

-- 재무
('5-2', 'finance', '미입금 예약 알림', '[온음] 미입금 예약 알림',
 E'재무담당자님,\n\n미입금 예약 {count}건이 있습니다.\n\n{list}\n\n관리자 페이지:\n{adminUrl}',
 ARRAY['count', 'list', 'adminUrl']),

('5-3', 'finance', '환불 안내', '[온음] 환불 안내',
 E'재무담당자님,\n\n예약 취소로 인한 환불 건이 있습니다.\n\n이름: {name}\n전화: {phone}\n금액: {amount}원\n예약일: {date}\n\n확인 부탁드립니다.',
 ARRAY['name', 'phone', 'amount', 'date']),

-- 관리자
('6-1', 'admin', '회원가입 신청', '[온음] 회원가입 신청',
 E'관리자님,\n\n새로운 회원가입 신청이 있습니다.\n\n이름: {name}\n세대: {household}호\n전화: {phone}\n\n관리자 페이지:\n{adminUrl}\n\n승인/거부 처리 부탁드립니다.',
 ARRAY['name', 'household', 'phone', 'adminUrl'])

ON CONFLICT (type_code) DO NOTHING;
```

---

## 3. Server Actions

### `app/actions/admin-templates.ts`

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { sendSMS } from '@/lib/solapi/client'

// ===== 타입 =====
export interface MessageTemplate {
  id: string
  type_code: string
  category: string
  name: string
  title: string
  content: string
  is_active: boolean
  variables: string[]
  created_at: string
  updated_at: string
}

// ===== 조회 =====
export async function getMessageTemplates(category?: string) {
  const supabase = await createClient()
  
  let query = supabase
    .from('message_templates')
    .select('*')
    .order('type_code')
  
  if (category) {
    query = query.eq('category', category)
  }
  
  const { data, error } = await query
  
  if (error) return { success: false, error: error.message, templates: [] }
  return { success: true, templates: data || [] }
}

export async function getTemplateByCode(typeCode: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('type_code', typeCode)
    .single()
  
  if (error) return { success: false, error: error.message, template: null }
  return { success: true, template: data }
}

// ===== 생성 =====
export async function createTemplate(template: {
  type_code: string
  category: string
  name: string
  title: string
  content: string
  variables: string[]
}) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('message_templates')
    .insert(template)
    .select()
    .single()
  
  if (error) return { success: false, error: error.message }
  return { success: true, template: data }
}

// ===== 수정 =====
export async function updateTemplate(
  id: string,
  updates: Partial<{
    name: string
    title: string
    content: string
    is_active: boolean
    variables: string[]
  }>
) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('message_templates')
    .update(updates)
    .eq('id', id)
  
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ===== 삭제 =====
export async function deleteTemplate(id: string) {
  const supabase = await createClient()
  
  const { error } = await supabase
    .from('message_templates')
    .delete()
    .eq('id', id)
  
  if (error) return { success: false, error: error.message }
  return { success: true }
}

// ===== 활성화 토글 =====
export async function toggleTemplateActive(id: string, isActive: boolean) {
  return updateTemplate(id, { is_active: isActive })
}

// ===== 테스트 발송 =====
export async function sendTestMessage(
  templateId: string,
  testPhone: string,
  testVariables: Record<string, string>
) {
  const supabase = await createClient()
  
  // 1. 템플릿 조회
  const { data: template, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', templateId)
    .single()
  
  if (error || !template) {
    return { success: false, error: '템플릿을 찾을 수 없습니다' }
  }
  
  // 2. 변수 치환
  let message = template.content
  for (const [key, value] of Object.entries(testVariables)) {
    message = message.replaceAll(`{${key}}`, value)
  }
  
  // 3. Solapi 발송
  try {
    const result = await sendSMS({
      to: testPhone.replace(/-/g, ''),
      text: message,
    })
    
    return { 
      success: true, 
      messageId: result.messageId,
      preview: message
    }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

// ===== 런타임용 템플릿 조회 (캐시 고려) =====
export async function getActiveTemplate(typeCode: string) {
  const supabase = await createClient()
  
  const { data, error } = await supabase
    .from('message_templates')
    .select('title, content, is_active, variables')
    .eq('type_code', typeCode)
    .eq('is_active', true)
    .single()
  
  if (error || !data) return null
  return data
}
```

---

## 4. UI 설계

### 페이지 구조

```
app/admin/templates/
├── page.tsx          # 템플릿 목록 (카테고리별 탭)
├── [id]/
│   └── page.tsx      # 템플릿 편집
└── new/
    └── page.tsx      # 새 템플릿 생성 (선택적)
```

### 목록 페이지 (`page.tsx`)

```tsx
// app/admin/templates/page.tsx
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getMessageTemplates, toggleTemplateActive } from '@/app/actions/admin-templates'

const CATEGORIES = [
  { key: 'all', label: '전체' },
  { key: 'signup', label: '회원가입' },
  { key: 'booking', label: '예약' },
  { key: 'payment', label: '입금' },
  { key: 'reminder', label: '리마인더' },
  { key: 'finance', label: '재무' },
  { key: 'admin', label: '관리자' },
]

export default function TemplatesPage() {
  const [templates, setTemplates] = useState([])
  const [category, setCategory] = useState('all')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadTemplates() }, [category])

  async function loadTemplates() {
    setLoading(true)
    const result = await getMessageTemplates(category === 'all' ? undefined : category)
    if (result.success) setTemplates(result.templates)
    setLoading(false)
  }

  async function handleToggle(id: string, currentActive: boolean) {
    await toggleTemplateActive(id, !currentActive)
    loadTemplates()
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">📝 메시지 템플릿 관리</h1>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => setCategory(cat.key)}
            className={`px-4 py-2 rounded-lg font-medium ${
              category === cat.key
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 hover:bg-gray-200'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* 템플릿 테이블 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">코드</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">이름</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">제목</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">활성화</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500">액션</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {templates.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-sm">{t.type_code}</td>
                <td className="px-4 py-3 text-sm">{t.name}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{t.title}</td>
                <td className="px-4 py-3 text-center">
                  <button onClick={() => handleToggle(t.id, t.is_active)}>
                    {t.is_active 
                      ? <span className="text-green-600">✅</span>
                      : <span className="text-gray-400">⬜</span>
                    }
                  </button>
                </td>
                <td className="px-4 py-3 text-center">
                  <Link
                    href={`/admin/templates/${t.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    편집
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

### 편집 페이지 (`[id]/page.tsx`)

```tsx
// app/admin/templates/[id]/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getTemplateByCode, updateTemplate, sendTestMessage } from '@/app/actions/admin-templates'

export default function EditTemplatePage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [template, setTemplate] = useState(null)
  const [form, setForm] = useState({ title: '', content: '' })
  const [testPhone, setTestPhone] = useState('')
  const [testVars, setTestVars] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => { loadTemplate() }, [params.id])

  async function loadTemplate() {
    // Note: 실제로는 id로 조회해야 함 (getTemplateById)
    const result = await getMessageTemplates()
    const found = result.templates.find((t) => t.id === params.id)
    if (found) {
      setTemplate(found)
      setForm({ title: found.title, content: found.content })
      // 변수 기본값 설정
      const vars: Record<string, string> = {}
      found.variables?.forEach((v: string) => { vars[v] = '' })
      setTestVars(vars)
    }
  }

  async function handleSave() {
    const result = await updateTemplate(params.id, form)
    if (result.success) {
      alert('저장되었습니다')
      router.push('/admin/templates')
    } else {
      alert('오류: ' + result.error)
    }
  }

  async function handleTestSend() {
    if (!testPhone) return alert('전화번호를 입력하세요')
    setSending(true)
    
    const result = await sendTestMessage(params.id, testPhone, testVars)
    
    if (result.success) {
      setPreview(result.preview || '')
      alert('테스트 발송 완료!')
    } else {
      alert('발송 실패: ' + result.error)
    }
    setSending(false)
  }

  // 실시간 미리보기
  function getPreview() {
    let msg = form.content
    Object.entries(testVars).forEach(([k, v]) => {
      msg = msg.replaceAll(`{${k}}`, v || `{${k}}`)
    })
    return msg
  }

  if (!template) return <div>로딩 중...</div>

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-2xl font-bold">✏️ 템플릿 편집: {template.name}</h1>
      
      {/* 기본 정보 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="text-sm text-gray-600">코드</label>
            <p className="font-mono text-lg">{template.type_code}</p>
          </div>
          <div>
            <label className="text-sm text-gray-600">카테고리</label>
            <p>{template.category}</p>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">제목</label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">내용</label>
            <textarea
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={10}
              className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              변수: {template.variables?.map((v: string) => `{${v}}`).join(', ')}
            </p>
          </div>
          
          <button
            onClick={handleSave}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            💾 저장
          </button>
        </div>
      </div>

      {/* 테스트 발송 */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-4">🧪 테스트 발송</h2>
        
        <div className="grid grid-cols-2 gap-6">
          {/* 변수 입력 */}
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium mb-1">수신 번호</label>
              <input
                type="tel"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="01012345678"
                className="w-full px-3 py-2 border rounded-lg"
              />
            </div>
            
            {template.variables?.map((v: string) => (
              <div key={v}>
                <label className="block text-sm font-medium mb-1">{v}</label>
                <input
                  type="text"
                  value={testVars[v] || ''}
                  onChange={(e) => setTestVars({ ...testVars, [v]: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                />
              </div>
            ))}
            
            <button
              onClick={handleTestSend}
              disabled={sending}
              className="w-full px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
            >
              {sending ? '발송 중...' : '📤 테스트 발송'}
            </button>
          </div>
          
          {/* 미리보기 */}
          <div>
            <label className="block text-sm font-medium mb-1">미리보기</label>
            <div className="p-4 bg-gray-100 rounded-lg whitespace-pre-wrap text-sm h-64 overflow-auto">
              {getPreview()}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 5. 마이그레이션 전략

### Phase 1: DB 우선, 하드코딩 Fallback

```typescript
// lib/notifications/templates.ts 수정

import { getActiveTemplate } from '@/app/actions/admin-templates'

export async function getMessageTemplate(
  type: MessageType,
  variables: TemplateVariables
): Promise<{ title: string; message: string }> {
  
  // 1. DB에서 템플릿 조회 시도
  const dbTemplate = await getActiveTemplate(type)
  
  if (dbTemplate) {
    // DB 템플릿 사용
    let message = dbTemplate.content
    for (const [key, value] of Object.entries(variables)) {
      message = message.replaceAll(`{${key}}`, value || '')
    }
    return { title: dbTemplate.title, message }
  }
  
  // 2. Fallback: 기존 하드코딩 로직
  return getHardcodedTemplate(type, variables)
}

// 기존 로직은 getHardcodedTemplate으로 이름 변경
function getHardcodedTemplate(type: MessageType, vars: TemplateVariables) {
  // ... 기존 코드 유지
}
```

### Phase 2: DB 완전 전환

- DB 템플릿이 안정적으로 작동하면 하드코딩 fallback 제거
- `getHardcodedTemplate` 함수 삭제

---

## 6. 구현 순서

### Phase A: DB & 마이그레이션 (Day 1)

- [ ] `003_message_templates.sql` 마이그레이션 작성
- [ ] Supabase에 마이그레이션 적용
- [ ] 15개 초기 템플릿 INSERT 확인

### Phase B: Server Actions (Day 1)

- [ ] `app/actions/admin-templates.ts` 생성
- [ ] CRUD 함수 구현 (get, create, update, delete)
- [ ] `toggleTemplateActive` 함수
- [ ] `sendTestMessage` 함수 (Solapi 연동)

### Phase C: UI (Day 2)

- [ ] `/admin/templates` 목록 페이지
- [ ] 카테고리 탭 필터
- [ ] 활성화 토글 버튼
- [ ] `/admin/templates/[id]` 편집 페이지
- [ ] 테스트 발송 UI + 실시간 미리보기

### Phase D: 통합 (Day 2-3)

- [ ] `lib/notifications/templates.ts` 수정 (DB fallback 추가)
- [ ] 기존 발송 로직 테스트
- [ ] Admin 사이드바에 "템플릿 관리" 메뉴 추가

### Phase E: QA & 배포 (Day 3)

- [ ] 전체 15개 템플릿 편집 테스트
- [ ] 테스트 발송 검증
- [ ] 활성화 ON/OFF 검증
- [ ] 프로덕션 배포

---

## 7. 참고 사항

### 변수 치환 규칙

- 변수 형식: `{variableName}` (중괄호)
- 치환 실패 시: 빈 문자열로 대체
- 미리보기에서는 `{variableName}` 그대로 표시

### Admin 사이드바 메뉴 추가

```tsx
// app/admin/layout.tsx 메뉴에 추가
{ href: '/admin/templates', label: '📝 템플릿 관리' }
```

### 테스트 발송 주의

- 테스트 발송은 `notification_logs`에 기록하지 않음
- 또는 `is_test: true` 플래그로 구분

---

**작성**: Buzz 🚀
**검토 필요**: 우디
