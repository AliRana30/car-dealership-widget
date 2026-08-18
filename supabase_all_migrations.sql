-- ============================================================================
-- Widgetized — Complete Database Migrations (Run in Supabase SQL Editor)
-- ============================================================================

-- 1. Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Ensure all columns on 'websites' table exist
ALTER TABLE websites ADD COLUMN IF NOT EXISTS css_selector_schema JSONB DEFAULT NULL;
ALTER TABLE websites ADD COLUMN IF NOT EXISTS detected_platform TEXT DEFAULT 'unknown';
ALTER TABLE websites ADD COLUMN IF NOT EXISTS sync_frequency TEXT DEFAULT 'off';

-- 3. Ensure all columns on 'website_data' table exist
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS data_type TEXT DEFAULT 'crawl';
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS category_path TEXT[] DEFAULT '{}'::TEXT[];
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS content_hash TEXT;
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW());
ALTER TABLE website_data ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 4. Ensure all columns on 'crawl_jobs' table exist
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS blocked_pages INTEGER DEFAULT 0;
ALTER TABLE crawl_jobs ADD COLUMN IF NOT EXISTS scan_mode TEXT DEFAULT 'master';

-- 5. Create HNSW Vector Index if not already present
CREATE INDEX IF NOT EXISTS idx_website_data_embedding ON website_data
USING hnsw (embedding vector_cosine_ops);

-- 6. Create Content Hash & Freshness Composite Index
CREATE INDEX IF NOT EXISTS idx_website_data_hash ON website_data(widget_id, source_url, content_hash);

-- 7. Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
