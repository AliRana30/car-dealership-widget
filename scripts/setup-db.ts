import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// Parse .env manually
const envPath = path.join(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split(/\r?\n/).forEach((line) => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (match) {
      const key = match[1];
      let val = match[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      process.env[key] = val;
    }
  });
}

const fullSchemaSql = `
-- Enable vector extension
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 1. Organizations
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

-- 2. Websites
CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    name TEXT NOT NULL,
    allowed_domains TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    css_selector_schema JSONB DEFAULT NULL,
    detected_platform TEXT DEFAULT 'unknown' NOT NULL,
    sync_frequency TEXT DEFAULT 'off' NOT NULL,
    known_urls JSONB DEFAULT '[]'::jsonb NOT NULL,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO websites (id, organization_id, name, allowed_domains)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'Default Website', '{}'::TEXT[])
ON CONFLICT (id) DO NOTHING;

-- 3. Widget Secrets
CREATE TABLE IF NOT EXISTS widget_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID REFERENCES websites(id) ON DELETE CASCADE,
    secret_type TEXT DEFAULT 'voice_provider',
    retell_api_key TEXT,
    vapi_api_key TEXT,
    consumer_key TEXT,
    consumer_secret TEXT,
    user_id UUID,
    encrypted BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 4. Agents
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    external_agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    credential_secret_id UUID REFERENCES widget_secrets(id) ON DELETE SET NULL,
    user_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 5. Widgets
CREATE TABLE IF NOT EXISTS widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id TEXT NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    user_id UUID,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    allowed_domains TEXT[] DEFAULT '{}'::TEXT[],
    config JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

INSERT INTO widgets (id, widget_id, organization_id, name, status, website_id, allowed_domains, config)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'default-widget-placeholder',
    '00000000-0000-0000-0000-000000000000',
    'Default Widget',
    'active',
    '00000000-0000-0000-0000-000000000000',
    '{}'::TEXT[],
    '{}'::JSONB
)
ON CONFLICT (id) DO NOTHING;

-- 6. Widget Configurations
CREATE TABLE IF NOT EXISTS widget_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id UUID REFERENCES widgets(id) ON DELETE CASCADE UNIQUE,
    branding JSONB NOT NULL DEFAULT '{}'::jsonb,
    theme JSONB NOT NULL DEFAULT '{}'::jsonb,
    typography JSONB NOT NULL DEFAULT '{}'::jsonb,
    launcher JSONB NOT NULL DEFAULT '{}'::jsonb,
    panel JSONB NOT NULL DEFAULT '{}'::jsonb,
    call JSONB NOT NULL DEFAULT '{}'::jsonb,
    chat JSONB NOT NULL DEFAULT '{}'::jsonb,
    behavior JSONB NOT NULL DEFAULT '{}'::jsonb,
    responsive JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 7. Website Data (Generic Intelligence & Web Content)
CREATE TABLE IF NOT EXISTS website_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id UUID NOT NULL REFERENCES widgets(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    source_url TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'text',
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    short_description TEXT,
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_type TEXT NOT NULL DEFAULT 'crawl',
    category_path TEXT[] DEFAULT '{}'::text[],
    content_hash TEXT,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    still_listed BOOLEAN DEFAULT TRUE NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 8. Vehicles (Normalized Dealership Vehicle Inventory)
CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id UUID NOT NULL REFERENCES widgets(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    vin TEXT,
    stock_number TEXT,
    condition TEXT DEFAULT 'used',
    year INTEGER,
    make TEXT,
    model TEXT,
    trim TEXT,
    body_style TEXT,
    price NUMERIC(12, 2),
    msrp NUMERIC(12, 2),
    currency TEXT DEFAULT 'USD',
    mileage INTEGER,
    drivetrain TEXT,
    transmission TEXT,
    engine TEXT,
    fuel TEXT,
    exterior_color TEXT,
    interior_color TEXT,
    features TEXT[] DEFAULT '{}'::TEXT[],
    description TEXT,
    short_description TEXT,
    images TEXT[] DEFAULT '{}'::TEXT[],
    vdp_url TEXT,
    source_url TEXT,
    provenance TEXT DEFAULT 'crawl',
    discovery_method TEXT,
    first_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    still_listed BOOLEAN DEFAULT TRUE NOT NULL,
    availability TEXT DEFAULT 'in_stock',
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    CONSTRAINT vehicles_widget_id_vin_unique UNIQUE (widget_id, vin)
);

-- 9. Crawl Jobs
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    start_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    scan_mode TEXT DEFAULT 'master',
    pages_visited INTEGER DEFAULT 0,
    entities_found INTEGER DEFAULT 0,
    blocked_pages INTEGER DEFAULT 0 NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 10. App Users
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    role TEXT DEFAULT 'owner',
    customizer_onboarding_status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    last_login_at TIMESTAMP WITH TIME ZONE,
    reset_token TEXT,
    reset_token_expires_at TIMESTAMP WITH TIME ZONE
);

-- 11. Users (alias table for backwards compatibility if queried)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    role TEXT DEFAULT 'owner',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 12. OTP Tokens
CREATE TABLE IF NOT EXISTS otp_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 13. App Sessions
CREATE TABLE IF NOT EXISTS app_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    session_token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    user_agent TEXT,
    ip_address TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_widgets_widget_id ON widgets(widget_id);
CREATE INDEX IF NOT EXISTS idx_widgets_organization_id ON widgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_widgets_website_id ON widgets(website_id);
CREATE INDEX IF NOT EXISTS idx_website_data_widget_id ON website_data(widget_id);
CREATE INDEX IF NOT EXISTS idx_website_data_last_seen ON website_data(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_website_data_still_listed ON website_data(still_listed);
CREATE INDEX IF NOT EXISTS idx_website_data_hash ON website_data(widget_id, source_url, content_hash);

CREATE INDEX IF NOT EXISTS idx_vehicles_widget_id ON vehicles(widget_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_condition ON vehicles(widget_id, condition);
CREATE INDEX IF NOT EXISTS idx_vehicles_make_model ON vehicles(widget_id, make, model);
CREATE INDEX IF NOT EXISTS idx_vehicles_price ON vehicles(widget_id, price);
CREATE INDEX IF NOT EXISTS idx_vehicles_year ON vehicles(widget_id, year);
CREATE INDEX IF NOT EXISTS idx_vehicles_still_listed ON vehicles(widget_id, still_listed);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_website_id ON crawl_jobs(website_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(email);
CREATE INDEX IF NOT EXISTS idx_otp_tokens_email ON otp_tokens(email);

-- Enable RLS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE widget_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_sessions ENABLE ROW LEVEL SECURITY;

-- Allow all access for service role / server-side
DROP POLICY IF EXISTS "Service role access" ON organizations;
CREATE POLICY "Service role access" ON organizations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON websites;
CREATE POLICY "Service role access" ON websites FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON widget_secrets;
CREATE POLICY "Service role access" ON widget_secrets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON agents;
CREATE POLICY "Service role access" ON agents FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON widgets;
CREATE POLICY "Service role access" ON widgets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON widget_configurations;
CREATE POLICY "Service role access" ON widget_configurations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON website_data;
CREATE POLICY "Service role access" ON website_data FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON vehicles;
CREATE POLICY "Service role access" ON vehicles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON crawl_jobs;
CREATE POLICY "Service role access" ON crawl_jobs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON app_users;
CREATE POLICY "Service role access" ON app_users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON users;
CREATE POLICY "Service role access" ON users FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON otp_tokens;
CREATE POLICY "Service role access" ON otp_tokens FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Service role access" ON app_sessions;
CREATE POLICY "Service role access" ON app_sessions FOR ALL USING (true) WITH CHECK (true);

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
`;

async function setupDatabase() {
  const connectionString = process.env.SUPABASE_DATABASE_URL;
  console.log('Connecting to database:', connectionString?.replace(/:[^:@]+@/, ':****@'));
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

  try {
    await client.connect();
    console.log('✓ Connected to Supabase PostgreSQL!');

    console.log('Applying database schema & migrations...');
    await client.query(fullSchemaSql);
    console.log('✓ All database tables, indexes, policies, and seeds applied successfully!');

    // Check tables
    const res = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    console.log('Current public tables:', res.rows.map(r => r.table_name));

    await client.end();
  } catch (err: any) {
    console.error('✗ Database setup error:', err.message);
    process.exit(1);
  }
}

setupDatabase();
