-- Migration: Add customizer_onboarding_status to app_users table
-- Tracks user-level onboarding completion/dismissal for the Widget Customizer

ALTER TABLE app_users 
ADD COLUMN IF NOT EXISTS customizer_onboarding_status TEXT DEFAULT 'pending';

-- Index for fast lookup by user_id and status
CREATE INDEX IF NOT EXISTS idx_app_users_customizer_onboarding ON app_users(id, customizer_onboarding_status);
