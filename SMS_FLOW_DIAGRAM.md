# 온음 문자 메시지 발송 플로우 차트

## 회원 예약 플로우

```mermaid
graph TD
    A[회원 예약 생성] -->|즉시| B[2-1: 예약 완료]
    B --> C[대기...]
    C -->|D-1 09:00| D[4-3: 내일 예약 안내]
    D --> E[이용일]
    E -->|선택| F[2-3: 예약 취소]
    
    style B fill:#e1f5e1
    style D fill:#e1f5e1
    style F fill:#ffe1e1
```

---

## 비회원 예약 플로우 - 정상 (입금 완료)

```mermaid
graph TD
    A[비회원 예약 생성] -->|즉시| B[2-2: 예약 완료<br/>입금 안내]
    B --> C[대기...]
    C -->|D-7 13:00| D[3-2: 입금 리마인더 1차]
    D --> E[대기...]
    E -->|D-5 13:00| F[3-2: 입금 리마인더 2차]
    F --> G[대기...]
    G -->|D-2 13:00| H[3-2: 입금 리마인더 3차]
    H --> I[입금 확인]
    I -->|즉시| J[3-1: 입금 확인]
    J --> K[대기...]
    K -->|D-1 09:00| L[4-1: 내일 예약 안내]
    L --> M[대기...]
    M -->|당일 09:00| N[4-2: 오늘 예약 안내<br/>계절별]
    N --> O[이용일]
    O -->|선택| P[2-3: 예약 취소<br/>+ 5-3: 재무 환불 안내]
    
    style B fill:#fff4e1
    style D fill:#e1f0ff
    style F fill:#e1f0ff
    style H fill:#e1f0ff
    style J fill:#e1f5e1
    style L fill:#e1f5e1
    style N fill:#e1f5e1
    style P fill:#ffe1e1
```

---

## 비회원 예약 플로우 - 미입금 취소

```mermaid
graph TD
    A[비회원 예약 생성] -->|즉시| B[2-2: 예약 완료<br/>입금 안내]
    B --> C[대기...]
    C -->|D-7 13:00| D[3-2: 입금 리마인더 1차]
    D --> E[대기...]
    E -->|D-5 13:00| F[3-2: 입금 리마인더 2차]
    F --> G[대기...]
    G -->|D-2 13:00| H[3-2: 입금 리마인더 3차]
    H --> I{입금 여부}
    I -->|미입금| J[대기...]
    J -->|당일 21:00| K[5-2: 재무 1차 알림<br/>21시 이전 예약]
    K --> L[대기...]
    L -->|당일 16:00| M[5-2: 재무 2차 알림<br/>전체 예약]
    M --> N[대기...]
    N -->|D-1 23:30| O[5-2: 재무 최종 알림]
    O --> P[대기...]
    P -->|당일 00:00| Q[자동 취소<br/>메시지 없음]
    
    style B fill:#fff4e1
    style D fill:#e1f0ff
    style F fill:#e1f0ff
    style H fill:#e1f0ff
    style K fill:#ffe8e1
    style M fill:#ffe8e1
    style O fill:#ffe8e1
    style Q fill:#ffcccc
```

---

## 크론 자동 발송 타임라인

```mermaid
gantt
    title 온음 크론 스케줄 (매일)
    dateFormat HH:mm
    axisFormat %H:%M
    
    section 예약자
    전날 리마인더 (4-1/4-3)     :milestone, m1, 09:00, 0m
    당일 리마인더 (4-2)         :milestone, m2, 09:00, 0m
    
    section 미입금
    입금 리마인더 D-7/5/2 (3-2) :milestone, m3, 13:00, 0m
    
    section 재무
    미입금 2차 알림 (5-2)       :milestone, m4, 16:00, 0m
    미입금 1차 알림 (5-2)       :milestone, m5, 21:00, 0m
    미입금 최종 알림 (5-2)      :milestone, m6, 23:30, 0m
    
    section 시스템
    미입금 자동 취소            :crit, milestone, m7, 00:00, 0m
```

---

## 메시지 타입별 색상 범례

| 색상 | 의미 | 메시지 타입 |
|------|------|-------------|
| 🟢 초록 | 예약 완료/확정 | 2-1, 3-1, 4-1, 4-3 |
| 🟡 노랑 | 입금 안내 | 2-2 |
| 🔵 파랑 | 입금 리마인더 | 3-2 |
| 🟠 주황 | 재무 알림 | 5-2 |
| 🔴 빨강 | 취소/환불 | 2-3, 5-3 |
| ⚫ 회색 | 자동 처리 | 자동 취소 |

---

## 간단 요약 플로우

```mermaid
flowchart LR
    A[예약] --> B{회원?}
    B -->|회원| C[2-1]
    B -->|비회원| D[2-2]
    
    C --> E[D-1: 4-3]
    E --> F[이용]
    
    D --> G[D-7/5/2: 3-2 x3]
    G --> H{입금?}
    H -->|완료| I[3-1]
    H -->|미완료| J[재무알림 5-2 x3]
    
    I --> K[D-1: 4-1]
    K --> L[당일: 4-2]
    L --> F
    
    J --> M[00:00 자동취소]
    
    style C fill:#e1f5e1
    style D fill:#fff4e1
    style E fill:#e1f5e1
    style G fill:#e1f0ff
    style I fill:#e1f5e1
    style J fill:#ffe8e1
    style K fill:#e1f5e1
    style L fill:#e1f5e1
    style M fill:#ffcccc
```

---

**작성일:** 2026-03-19  
**작성자:** 버즈  
**버전:** 1.0
