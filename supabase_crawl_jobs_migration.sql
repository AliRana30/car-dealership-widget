-- ── crawl_jobs table ─────────────────────────────────────────────────────────
-- Tracks background website intelligence crawl jobs

CREATE TABLE IF NOT EXISTS crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
    start_url TEXT NOT NULL,
    pages_visited INTEGER DEFAULT 0,
    entities_found INTEGER DEFAULT 0,
    error_message TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_website_id ON crawl_jobs(website_id);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_created_at ON crawl_jobs(created_at DESC);

-- Auto updated_at
DROP TRIGGER IF EXISTS update_crawl_jobs_updated_at ON crawl_jobs;
CREATE TRIGGER update_crawl_jobs_updated_at BEFORE UPDATE ON crawl_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS
ALTER TABLE crawl_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all access to server-side operations" ON crawl_jobs;
CREATE POLICY "Allow all access to server-side operations" ON crawl_jobs FOR ALL USING (true) WITH CHECK (true);
