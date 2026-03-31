-- 메시지 템플릿 관리 테이블
-- PRD: docs/PRD-message-templates-ui.md

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

CREATE POLICY "Anyone can view active templates" ON message_templates 
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admin can manage all templates" ON message_templates 
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

-- ===== 초기 데이터: 15개 템플릿 =====

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
