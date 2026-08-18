-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- Insert default organization
INSERT INTO organizations (id, name)
VALUES ('00000000-0000-0000-0000-000000000000', 'Default Organization')
ON CONFLICT (id) DO NOTHING;

-- Create the websites table
CREATE TABLE IF NOT EXISTS websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    allowed_domains TEXT[] DEFAULT '{}'::TEXT[] NOT NULL,
    css_selector_schema JSONB DEFAULT NULL,
    detected_platform TEXT DEFAULT 'unknown' NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);



-- Insert default website
INSERT INTO websites (id, organization_id, name, allowed_domains)
VALUES ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000', 'Default Website', '{}'::TEXT[])
ON CONFLICT (id) DO NOTHING;

-- Create the widget secrets table to isolate API keys and platform credentials
CREATE TABLE IF NOT EXISTS widget_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID REFERENCES websites(id) ON DELETE CASCADE,
    secret_type TEXT DEFAULT 'voice_provider',
    retell_api_key TEXT,
    vapi_api_key TEXT,
    consumer_key TEXT,
    consumer_secret TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- Create the agents table
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('retell', 'vapi')),
    external_agent_id TEXT NOT NULL,
    name TEXT NOT NULL,
    credential_secret_id UUID REFERENCES widget_secrets(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Create the widgets table representing the complete Widget Model
CREATE TABLE IF NOT EXISTS widgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id TEXT NOT NULL UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE DEFAULT '00000000-0000-0000-0000-000000000000',
    agent_id UUID REFERENCES agents(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'paused')),
    allowed_domains TEXT[] DEFAULT '{}'::TEXT[],
    config JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes for performance and relational lookups
CREATE INDEX IF NOT EXISTS idx_widgets_widget_id ON widgets(widget_id);
CREATE INDEX IF NOT EXISTS idx_widgets_organization_id ON widgets(organization_id);
CREATE INDEX IF NOT EXISTS idx_widgets_website_id ON widgets(website_id);
CREATE INDEX IF NOT EXISTS idx_widgets_agent_id ON widgets(agent_id);

-- Automatic updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_widgets_updated_at ON widgets;
CREATE TRIGGER update_widgets_updated_at BEFORE UPDATE ON widgets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_widget_secrets_updated_at ON widget_secrets;
CREATE TRIGGER update_widget_secrets_updated_at BEFORE UPDATE ON widget_secrets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE widget_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE websites ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Create policies to allow operations from Next.js server-side route handlers
DROP POLICY IF EXISTS "Allow all access to server-side operations" ON widget_secrets;
CREATE POLICY "Allow all access to server-side operations" ON widget_secrets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to server-side operations" ON widgets;
CREATE POLICY "Allow all access to server-side operations" ON widgets FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to server-side operations" ON organizations;
CREATE POLICY "Allow all access to server-side operations" ON organizations FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to server-side operations" ON websites;
CREATE POLICY "Allow all access to server-side operations" ON websites FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access to server-side operations" ON agents;
CREATE POLICY "Allow all access to server-side operations" ON agents FOR ALL USING (true) WITH CHECK (true);

-- Create the widget configurations table representing the complete customization state
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

-- Index for relational lookups
CREATE INDEX IF NOT EXISTS idx_widget_configurations_widget_id ON widget_configurations(widget_id);

-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS update_widget_configurations_updated_at ON widget_configurations;
CREATE TRIGGER update_widget_configurations_updated_at BEFORE UPDATE ON widget_configurations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE widget_configurations ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations from Next.js server-side route handlers
DROP POLICY IF EXISTS "Allow all access to server-side operations" ON widget_configurations;
CREATE POLICY "Allow all access to server-side operations" ON widget_configurations FOR ALL USING (true) WITH CHECK (true);

-- Create the website data table to store indexed/crawled site intelligence
CREATE TABLE IF NOT EXISTS website_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id UUID NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
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
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Index for fast relational lookup
CREATE INDEX IF NOT EXISTS idx_website_data_widget_id ON website_data(widget_id);


-- Automatic updated_at trigger
DROP TRIGGER IF EXISTS update_website_data_updated_at ON website_data;
CREATE TRIGGER update_website_data_updated_at BEFORE UPDATE ON website_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE website_data ENABLE ROW LEVEL SECURITY;

-- Create the crawl jobs table
CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    start_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'blocked')),
    scan_mode TEXT DEFAULT 'master',
    pages_visited INTEGER DEFAULT 0,
    entities_found INTEGER DEFAULT 0,
    blocked_pages INTEGER DEFAULT 0 NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_website_id ON crawl_jobs(website_id);
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to server-side operations" ON crawl_jobs;
CREATE POLICY "Allow all access to server-side operations" ON crawl_jobs FOR ALL USING (true) WITH CHECK (true);

-- Insert seed website intelligence data for the Default Website

INSERT INTO website_data (website_id, url, title, content, data_type)
VALUES 
('00000000-0000-0000-0000-000000000000', 'https://example.com/services', 'CarePoint Clinic Services', 'We provide general consultations ($50), pediatric care ($60), vaccinations ($30), and specialized cardiovascular exams ($150). Appointments can be booked online. We are open Mon-Fri 8am-6pm.', 'service'),
('00000000-0000-0000-0000-000000000000', 'https://example.com/inventory', 'Available Vehicle Inventory', 'We have the following vehicles in stock: 2023 Tesla Model Y (Long Range, White, $42,990), 2022 Ford F-150 (Lightning Electric, Blue, $54,500), 2021 Toyota RAV4 (Hybrid, Silver, $28,400). Contact us for test drives.', 'product'),
('00000000-0000-0000-0000-000000000000', 'https://example.com/pricing', 'Front Desk Widget Product FAQ', 'The Front Desk Widget integrates voice and text AI agents on your site. Pricing plans: Starter ($49/mo, 1000 mins), Professional ($149/mo, 5000 mins), Enterprise (custom). Supports Retell and Vapi integrations.', 'text')
ON CONFLICT (id) DO NOTHING;
