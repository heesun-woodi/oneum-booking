-- 선불권 메시지 템플릿 추가
-- 7-1: 구매자 입금 안내, 7-2: 관리자 구매 알림, 7-3: 선불권 활성화 안내

INSERT INTO message_templates (type_code, category, name, title, content, is_active, variables, trigger_info)
VALUES
  (
    '7-1',
    'prepaid',
    '선불권 구매 입금 안내',
    '[온음] 선불권 신청 완료 - 입금 안내',
    '{name}님, 선불권 신청이 완료되었습니다!

🎟️ 상품: {productName}
💰 금액: {amount}원

[입금 정보]
{account}

입금 기한: {deadline}까지
* 기한 내 미입금 시 자동 취소됩니다.

입금 후 관리자 확인 시 선불권이 활성화됩니다.
감사합니다! 🎵',
    true,
    ARRAY['name', 'productName', 'amount', 'account', 'deadline'],
    '선불권 구매 신청 직후 (구매자에게)'
  ),
  (
    '7-2',
    'prepaid',
    '선불권 신청 알림 (관리자)',
    '[온음] 선불권 신청 알림',
    '재무담당자님,

선불권 신청이 들어왔습니다.

이름: {name}
세대: {household}호
전화: {phone}
상품: {productName}
금액: {amount}원
입금 기한: {deadline}까지

관리자 페이지:
{adminUrl}

입금 확인 후 승인 처리 부탁드립니다.',
    true,
    ARRAY['name', 'household', 'phone', 'productName', 'amount', 'deadline', 'adminUrl'],
    '선불권 구매 신청 직후 (관리자에게)'
  ),
  (
    '7-3',
    'prepaid',
    '선불권 활성화 완료',
    '[온음] 선불권 활성화 완료',
    '{name}님, 선불권이 활성화되었습니다!

🎟️ 상품: {productName}
⏱️ 총 시간: {totalHours}시간

마이페이지에서 잔여 시간을 확인하실 수 있습니다.
온음과 함께 즐거운 시간 보내세요! 🎵',
    true,
    ARRAY['name', 'productName', 'totalHours'],
    '관리자가 선불권 입금 승인 시'
  )
ON CONFLICT (type_code) DO NOTHING;

SELECT 'prepaid templates inserted' as message;
