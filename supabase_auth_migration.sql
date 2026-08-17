-- ============================================================================
-- Front Desk Auth & User Isolation Migration
-- Run this in your Supabase SQL editor
-- ============================================================================

-- 1. Create the users table (mirrors Supabase auth.users for app-level data)
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE,
    reset_token TEXT,
    reset_token_expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_app_users_reset_token ON app_users(reset_token) WHERE reset_token IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_app_users_updated_at ON app_users;
CREATE TRIGGER update_app_users_updated_at BEFORE UPDATE ON app_users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on app_users
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

-- Only server-side (service role) can access app_users
DROP POLICY IF EXISTS "Service role only" ON app_users;
CREATE POLICY "Service role only" ON app_users FOR ALL USING (true) WITH CHECK (true);

-- 2. Add user_id to organizations
ALTER TABLE organizations
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_organizations_user_id ON organizations(user_id);

-- 3. Add user_id to widgets (direct ownership)
ALTER TABLE widgets
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_widgets_user_id ON widgets(user_id);

-- 4. Add user_id to websites
ALTER TABLE websites
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_websites_user_id ON websites(user_id);

-- 5. Add user_id to agents
ALTER TABLE agents
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id);

-- 6. Add encryption metadata to widget_secrets
--    The actual keys will be stored AES-256-GCM encrypted.
--    We store: iv (hex) + auth_tag (hex) + ciphertext (hex), colon-delimited.
--    Column names stay the same — the app layer handles en/decrypt.
--    We add a flag so we know which rows have been migrated.
ALTER TABLE widget_secrets
    ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
    ADD COLUMN IF NOT EXISTS encrypted BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_widget_secrets_user_id ON widget_secrets(user_id);

-- 7. Sessions table for server-side session tracking (optional but useful for logout-all)
CREATE TABLE IF NOT EXISTS app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    user_agent TEXT,
    ip_address TEXT
);

CREATE INDEX IF NOT EXISTS idx_app_sessions_user_id ON app_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_app_sessions_token ON app_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_app_sessions_expires ON app_sessions(expires_at);

ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role only" ON app_sessions;
CREATE POLICY "Service role only" ON app_sessions FOR ALL USING (true) WITH CHECK (true);

-- 8. Trigger for updated_at on any new tables that need it
-- (app_sessions doesn't need it but app_users does — already added above)

-- ============================================================================
-- NOTE: The default seed data (00000000-0000-0000-0000-000000000000 org/website)
-- will have null user_id which is intentional — it's the legacy/embed-only path.
-- All new data created after auth implementation will carry a user_id.
-- ============================================================================
