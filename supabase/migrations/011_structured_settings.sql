-- ===== 구조화된 공간 정보 & 이용 규칙 =====
-- site_settings 테이블에 JSON 형태로 저장

-- 1. 공간 정보 (spaces_info)
INSERT INTO site_settings (key, value) VALUES (
    'spaces_info',
    '{
        "nolter": {
            "name": "놀터",
            "description": "아이들이 자유롭게 놀 수 있는 공간",
            "capacity": "최대 8명",
            "facilities": ["장난감", "매트", "보드게임", "에어컨/난방"],
            "rules": ["신발을 벗고 입장해주세요", "음식물 반입 금지", "사용 후 정리정돈", "시설물 파손 시 변상"],
            "hours": "09:00 ~ 22:00",
            "pricing": {
                "member": "무료 (월 8시간까지)",
                "nonMember": "14,000원/시간"
            }
        },
        "soundroom": {
            "name": "방음실",
            "description": "악기 연습, 노래 연습이 가능한 방음 공간",
            "capacity": "최대 4명",
            "facilities": ["방음시설", "마이크", "스피커", "의자"],
            "rules": ["악기는 개인 지참", "음량 조절 협조", "사용 후 정리정돈", "시설물 파손 시 변상"],
            "hours": "09:00 ~ 22:00",
            "pricing": {
                "member": "무료 (월 8시간까지)",
                "nonMember": "14,000원/시간"
            }
        }
    }'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();

-- 2. 이용 규칙 (general_rules)
INSERT INTO site_settings (key, value) VALUES (
    'general_rules',
    '{
        "booking": [
            "예약은 1일 전까지 가능합니다 (당일 예약 불가)",
            "회원은 월 8시간까지 무료 이용",
            "초과 시간은 14,000원/시간",
            "비회원은 모든 이용에 14,000원/시간"
        ],
        "cancellation": [
            "이용일 2일 전까지 무료 취소",
            "이용일 1일 전 취소 시 50% 환불",
            "당일 취소 시 환불 불가"
        ],
        "payment": [
            "비회원 예약 후 이용일 1일 전까지 입금",
            "입금 계좌: 카카오뱅크 7979-72-56275 (정상은)",
            "예금주명과 예약자명이 다를 경우 사전 연락"
        ],
        "usage": [
            "예약 시간 엄수",
            "타인에게 방해되는 행위 금지",
            "쓰레기는 되가져가기",
            "시설물 고의 파손 시 변상"
        ]
    }'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW();
