-- =============================================================================
-- Migration: 20261124_email_notifications.sql
-- Dự án: Fire Detection Studio
-- Mô tả: Bảng tùy chọn nhận email, lưu sự kiện lửa và lịch sử gửi thư qua SMTP
-- =============================================================================

-- 1. BẢNG TÙY CHỌN NHẬN EMAIL THEO TÀI KHOẢN (Mặc định tắt)
CREATE TABLE IF NOT EXISTS public.user_email_preferences (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    email_alerts_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Bật Row Level Security (RLS)
ALTER TABLE public.user_email_preferences ENABLE ROW LEVEL SECURITY;

-- Chính sách RLS: Người dùng chỉ được xem và chỉnh sửa tùy chọn của chính mình
CREATE POLICY "Users can view own email preferences"
    ON public.user_email_preferences
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own email preferences"
    ON public.user_email_preferences
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own email preferences"
    ON public.user_email_preferences
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- 2. BẢNG SỰ KIỆN LỬA ĐƯỢC XÁC NHẬN (Fire Alert Events)
CREATE TABLE IF NOT EXISTS public.fire_alert_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('video', 'camera')),
    model_name TEXT,
    confirmed_time_ms DOUBLE PRECISION NOT NULL,
    playback_time_str TEXT,
    max_confidence DOUBLE PRECISION NOT NULL,
    box JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    CONSTRAINT unique_user_event_id UNIQUE (user_id, event_id)
);

-- Bật RLS
ALTER TABLE public.fire_alert_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fire alert events"
    ON public.fire_alert_events
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own fire alert events"
    ON public.fire_alert_events
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- 3. BẢNG TRẠNG THÁI GỬI EMAIL CẢNH BÁO (Email Dispatches)
-- Đảm bảo mỗi event_id chỉ gửi đúng 1 lần (chống gửi lặp)
CREATE TABLE IF NOT EXISTS public.email_dispatches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id TEXT NOT NULL,
    recipient_email TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed')),
    error_message TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Chỉ mục hỗ trợ tìm kiếm nhanh theo user và session
CREATE INDEX IF NOT EXISTS idx_email_dispatches_user_session 
    ON public.email_dispatches(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_email_dispatches_event_id 
    ON public.email_dispatches(event_id);

-- Bật RLS
ALTER TABLE public.email_dispatches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own email dispatches"
    ON public.email_dispatches
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all dispatches"
    ON public.email_dispatches
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
