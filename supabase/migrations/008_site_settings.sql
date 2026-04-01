CREATE TABLE IF NOT EXISTS site_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO site_settings (key, value) VALUES (
    'reservation_guide',
    '• 운영시간: 09:00 - 23:00
• 당일 예약 불가 (최소 1일 전에 예약)
• 예약일 전날 23:59까지 입금 필수
• 입금계좌: 카카오뱅크 7979-72-56275 (정상은)
• 기한 내 미입금 시 → 자동 취소 됩니다
  예시: 4월 10일 예약 → 4월 9일 23:59까지 입금'
) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read site settings"
    ON site_settings
    FOR SELECT
    TO public
    USING (true);

-- Allow authenticated users to update (Ideally only admins)
CREATE POLICY "Admins can update site settings"
    ON site_settings
    FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.is_admin = true
        )
    );
